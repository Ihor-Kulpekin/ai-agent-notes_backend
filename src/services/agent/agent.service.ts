import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { buildAgentGraph } from './agent.graph';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { LlmService } from 'src/services/llm/LlmService';
import { IAgentResponse } from 'src/interfaces/agent/agent.models';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private graph: Awaited<ReturnType<typeof buildAgentGraph>>;

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly memory: MemoryOrchestratorService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Будуємо граф при ініціалізації модуля
    const llm = this.llmService.getModel();
    this.graph = buildAgentGraph(llm, this.vectorStoreService);

    this.logger.log('Agent graph initialized');
  }

  /**
   * Запускає граф агента.
   * Граф сам вирішує: планувати → шукати → відповідати.
   */
  async run(
    question: string,
    userId: string = 'default-user',
    sessionId: string = 'default',
  ): Promise<IAgentResponse> {
    const memoryCtx = await this.memory.constructFinalPrompt(
      userId,
      question,
      sessionId,
    );
    const memoryMessages = this.memory.toMessageArray(memoryCtx);

    const result = await this.graph.invoke({
      question,
      plan: '',
      documents: [],
      answer: '',
      sources: [],
      steps: [],
      messages: [],
      memoryContext: memoryMessages, // ← NEW
    });

    await this.memory.recordAssistantResponse(userId, result.answer, sessionId);

    const openAiModel = this.configService.get<string>('openai.model') || '';

    return {
      answer: result.answer,
      sources: result.sources || [],
      steps: result.steps || [],
      model: openAiModel,
    };
  }
}
