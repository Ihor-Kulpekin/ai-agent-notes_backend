import { Injectable, OnModuleInit } from '@nestjs/common';
import { buildAgentGraph } from './agent.graph';
import { VectorStoreService } from 'src/services/vectore-store/vector-store.service';
import { LlmService } from 'src/services/llm/LlmService';
import { IAgentResponse } from 'src/interfaces/agent/agent.models';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';

@Injectable()
export class AgentService implements OnModuleInit {
  private graph: Awaited<ReturnType<typeof buildAgentGraph>>;

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly memory: MemoryOrchestratorService,
  ) {}

  onModuleInit() {
    // Будуємо граф при ініціалізації модуля
    const llm = this.llmService.getModel();
    this.graph = buildAgentGraph(llm, this.vectorStoreService);

    console.log('Agent graph initialized');
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

    return {
      answer: result.answer,
      sources: result.sources || [],
      steps: result.steps || [],
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
}
