import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { Command, isInterrupted, GraphInterrupt } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Socket } from 'socket.io';
import { buildAgentGraph } from './agent.graph';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { LlmService } from 'src/services/llm/LlmService';
import { IAgentResponse } from 'src/interfaces/agent/agent.models';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';
import { ConfigService } from '@nestjs/config';
import { AgentEventEmitter } from 'src/gateways/agent-event.emitter';

/** Mapping від назви вузла LangGraph до людино-читабельного опису */
const NODE_LABELS: Record<string, string> = {
  planner: 'Аналіз запиту та вибір стратегії',
  search: 'Пошук релевантних документів',
  relevance_check: 'Перевірка релевантності документів',
  generator: 'Генерація відповіді',
  grader: 'Оцінка якості відповіді',
  tools_caller: 'Підготовка виклику інструменту',
  tools_executor: 'Виконання інструменту',
  tools_result: 'Обробка результату інструменту',
};

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private graph: Awaited<ReturnType<typeof buildAgentGraph>>;

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly memory: MemoryOrchestratorService,
    private readonly configService: ConfigService,
    @Inject('CHECKPOINTER') private readonly checkpointer: BaseCheckpointSaver,
    // Optional: завантажується лише коли SocketModule активний
    // Це розриває потенційну circular dependency
    @Optional() private readonly eventEmitter: AgentEventEmitter,
  ) {}

  onModuleInit() {
    const llmRaw = this.llmService.getModel();
    const llmWithFallbacks = this.llmService.getModelWithFallbacks();
    const fastLlm = this.llmService.getFastModel();
    this.graph = buildAgentGraph(
      llmRaw,
      llmWithFallbacks,
      this.vectorStoreService,
      this.checkpointer,
      fastLlm,
    );
    this.logger.log('Agent graph initialized with checkpointer + tiered LLM');
    // Дебаг: перевіряємо що AgentEventEmitter був інжектований (BUG #1 з ws-fix-plan.md)
    this.logger.log(`EventEmitter available: ${!!this.eventEmitter}`);
  }

  // ── REST API (статичні методи) ─────────────────────────────

  /**
   * Запускає граф агента з thread persistence.
   * Використовується REST-ендпоінтом POST /chat.
   */
  async run(
    question: string,
    userId: string = 'default-user',
    sessionId?: string,
  ): Promise<IAgentResponse> {
    const threadId = sessionId ?? uuid();
    const config = { configurable: { thread_id: threadId } };

    const memoryCtx = await this.memory.constructFinalPrompt(
      userId,
      question,
      threadId,
    );
    const memoryMessages = this.memory.toMessageArray(memoryCtx);

    const result = await this.graph.invoke(
      {
        question,
        plan: '',
        documents: [],
        answer: '',
        sources: [],
        steps: [],
        messages: [],
        memoryContext: memoryMessages,
        retryCount: 0,
        gradingFeedback: '',
      },
      config,
    );

    const openAiModel = this.configService.get<string>('openai.model') || '';

    if (isInterrupted(result)) {
      const snapshot = await this.graph.getState(config);
      const pendingAction = this.extractPendingAction(snapshot);

      // Емітуємо WS-подію навіть з REST (якщо клієнт підключений)
      this.eventEmitter?.emitInterrupt(threadId, {
        threadId,
        ...pendingAction,
      });

      return {
        answer: '',
        sources: [],
        steps: (result as { steps?: string[] }).steps || [],
        model: openAiModel,
        threadId,
        status: 'pending_approval',
        pendingAction,
      };
    }

    await this.memory.recordAssistantResponse(userId, result.answer, threadId);

    return {
      answer: result.answer,
      sources: result.sources || [],
      steps: result.steps || [],
      model: openAiModel,
      threadId,
      status: 'completed',
    };
  }

  /**
   * Human-in-the-Loop (REST): approve — виконати tool.
   */
  async resume(threadId: string, feedback?: string): Promise<IAgentResponse> {
    const config = { configurable: { thread_id: threadId } };
    const resumeValue = feedback ? `approve: ${feedback}` : 'approve';

    const result = await this.graph.invoke(
      new Command({ resume: resumeValue }),
      config,
    );

    const openAiModel = this.configService.get<string>('openai.model') || '';
    return {
      answer: result.answer,
      sources: result.sources || [],
      steps: result.steps || [],
      model: openAiModel,
      threadId,
      status: 'completed',
    };
  }

  /**
   * Human-in-the-Loop (REST): reject — відхилити tool, відповісти у direct mode.
   */
  async reject(threadId: string, feedback?: string): Promise<IAgentResponse> {
    const config = { configurable: { thread_id: threadId } };
    const rejectValue = feedback ? `reject: ${feedback}` : 'reject';

    const result = await this.graph.invoke(
      new Command({ resume: rejectValue, update: { plan: 'direct' } }),
      config,
    );

    const openAiModel = this.configService.get<string>('openai.model') || '';
    return {
      answer: result.answer,
      sources: result.sources || [],
      steps: result.steps || [],
      model: openAiModel,
      threadId,
      status: 'completed',
    };
  }

  // ── WebSocket Streaming ──────────────────────────────────────

  /**
   * stream() — запускає граф з real-time streaming через WebSockets.
   *
   * Використовується ChatGateway при 'chat:message' події.
   * Для кожного завершеного вузла графа — емітує 'agent:step'.
   * Якщо граф переривається (HITL) — емітує 'agent:interrupt'.
   * Після завершення — емітує 'agent:done'.
   *
   * @param client - socket.io client socket (для room join та прямих emit)
   */
  async stream(
    question: string,
    userId: string = 'default-user',
    sessionId: string | undefined,
    client: Socket,
  ): Promise<void> {
    const threadId = sessionId ?? uuid();
    const config = { configurable: { thread_id: threadId } };
    const openAiModel = this.configService.get<string>('openai.model') || '';

    // Клієнт приєднується до кімнати зі своїм threadId
    // await гарантує, що join завершився ДО початку graph.stream()
    await client.join(threadId);
    this.logger.debug(
      `stream(): client ${client.id} joined room "${threadId}" | rooms: ${JSON.stringify([...client.rooms])}`,
    );

    const memoryCtx = await this.memory.constructFinalPrompt(
      userId,
      question,
      threadId,
    );
    const memoryMessages = this.memory.toMessageArray(memoryCtx);

    const initialState = {
      question,
      plan: '',
      documents: [],
      answer: '',
      sources: [],
      steps: [],
      messages: [],
      memoryContext: memoryMessages,
      retryCount: 0,
      gradingFeedback: '',
    };

    let lastState: Record<string, unknown> = {};
    let interrupted = false;

    try {
      // graph.stream() повертає AsyncIterable<{ [nodeName]: nodeOutput }>
      const streamIter = await this.graph.stream(initialState, {
        ...config,
        streamMode: 'updates', // Отримуємо тільки зміни стану (дельти), не весь стан
      });

      for await (const chunk of streamIter) {
        // chunk = { [nodeName]: { ...stateUpdates } }
        const nodeName = Object.keys(chunk)[0];

        if (!nodeName) continue;

        // LangGraph JS в режимі streamMode:'updates' янго yield-ує
        // вузол '__interrupt__' замість throw GraphInterrupt.
        // Идентифікуємо його тут, щоб не емітувати як agent:step.
        if (nodeName === '__interrupt__') {
          interrupted = true;
          const snapshot = await this.graph.getState(config);
          const pendingAction = this.extractPendingAction(snapshot);
          this.logger.log(
            `stream(): HITL interrupt detected for thread "${threadId}" — emitting agent:interrupt`,
          );
          this.eventEmitter?.emitInterrupt(threadId, {
            threadId,
            ...pendingAction,
          });
          break; // зупиняємо цикл — agent:done ДАЛІ НЕ відправляємо
        }

        // Typed cast до уникнення unsafe-any на chunk index signature
        const nodeOutput = chunk[nodeName] as Record<string, unknown>;
        lastState = { ...lastState, ...nodeOutput };

        // Емітуємо крок клієнту
        this.eventEmitter?.emitStep(threadId, {
          threadId,
          node: nodeName,
          summary: NODE_LABELS[nodeName] ?? nodeName,
        });
      }
    } catch (err) {
      if (err instanceof GraphInterrupt) {
        // Запасний handler — на випадок якщо LangGraph все ж throw-ає
        interrupted = true;
        const snapshot = await this.graph.getState(config);
        const pendingAction = this.extractPendingAction(snapshot);
        this.eventEmitter?.emitInterrupt(threadId, {
          threadId,
          ...pendingAction,
        });
        return;
      }
      throw err;
    }

    // Якщо граф був перерваний — agent:done НЕ відправляємо.
    // UI вже отримав agent:interrupt і чекає на chat:resume.
    if (interrupted) return;

    // Граф повністю завершено — відправляємо фінальну відповідь
    await this.memory.recordAssistantResponse(
      userId,
      lastState.answer as string,
      threadId,
    );

    this.eventEmitter?.emitDone(threadId, {
      threadId,
      answer: (lastState.answer as string) || '',
      sources:
        (lastState.sources as Array<{ source: string; preview: string }>) || [],
      steps: (lastState.steps as string[]) || [],
      model: openAiModel,
    });
  }

  /**
   * streamResume() — відновлює граф після HITL та стрімить результат.
   *
   * Використовується ChatGateway при 'chat:resume' події.
   */
  async streamResume(
    threadId: string,
    action: 'approve' | 'reject',
    feedback: string | undefined,
    client: Socket,
  ): Promise<void> {
    const config = { configurable: { thread_id: threadId } };
    const openAiModel = this.configService.get<string>('openai.model') || '';

    // Переконуємося що клієнт в кімнаті
    await client.join(threadId);

    const resumeValue = feedback ? `${action}: ${feedback}` : action;

    let lastState: Record<string, unknown> = {};
    let interrupted = false;

    try {
      const streamIter = await this.graph.stream(
        action === 'approve'
          ? new Command({ resume: resumeValue })
          : new Command({
              resume: resumeValue,
              update: { plan: 'direct' as const },
            }),
        {
          ...config,
          streamMode: 'updates',
        },
      );

      for await (const chunk of streamIter) {
        const nodeName = Object.keys(chunk)[0];
        if (!nodeName) continue;

        // Обробка повторного interrupt (e.g. multi-step HITL)
        if (nodeName === '__interrupt__') {
          interrupted = true;
          const snapshot = await this.graph.getState(config);
          const pendingAction = this.extractPendingAction(snapshot);
          this.logger.log(
            `streamResume(): HITL interrupt detected for thread "${threadId}" — emitting agent:interrupt`,
          );
          this.eventEmitter?.emitInterrupt(threadId, {
            threadId,
            ...pendingAction,
          });
          break;
        }

        // Typed cast до уникнення unsafe-any на chunk index signature
        const nodeOutput = chunk[nodeName] as Record<string, unknown>;
        lastState = { ...lastState, ...nodeOutput };

        this.eventEmitter?.emitStep(threadId, {
          threadId,
          node: nodeName,
          summary: NODE_LABELS[nodeName] ?? nodeName,
        });
      }
    } catch (err) {
      if (err instanceof GraphInterrupt) {
        interrupted = true;
        const snapshot = await this.graph.getState(config);
        const pendingAction = this.extractPendingAction(snapshot);
        this.eventEmitter?.emitInterrupt(threadId, {
          threadId,
          ...pendingAction,
        });
        return;
      }
      throw err;
    }

    if (interrupted) return;

    this.eventEmitter?.emitDone(threadId, {
      threadId,
      answer: (lastState.answer as string) || '',
      sources:
        (lastState.sources as Array<{ source: string; preview: string }>) || [],
      steps: (lastState.steps as string[]) || [],
      model: openAiModel,
    });
  }

  /**
   * Отримує поточний стан thread (time-travel debugging).
   */
  async getState(threadId: string) {
    return this.graph.getState({ configurable: { thread_id: threadId } });
  }

  // ── Приватні утиліти ──────────────────────────────────────

  private extractPendingAction(
    snapshot: Awaited<ReturnType<typeof this.graph.getState>>,
  ) {
    const messages =
      (snapshot.values as { messages?: unknown[] }).messages ?? [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown>;
      const toolCalls = msg.tool_calls as
        | Array<{ name: string; args: unknown }>
        | undefined;

      if (toolCalls && toolCalls.length > 0) {
        const firstCall = toolCalls[0];
        return {
          node: 'tools_executor' as const,
          toolName: firstCall.name,
          toolArgs: firstCall.args,
          description: `Agent wants to call tool "${firstCall.name}" with args: ${JSON.stringify(firstCall.args)}`,
        };
      }
    }

    return {
      node: 'tools_executor' as const,
      toolName: 'unknown',
      toolArgs: {},
      description: 'Agent wants to execute a tool. Please approve or reject.',
    };
  }
}
