import { Injectable } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { ChatResponseDto } from 'src/dto/chat.dto';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly agentService: AgentService,
    private readonly memory: MemoryOrchestratorService,
  ) {}

  async ask(
    question: string,
    userId: string,
    sessionId?: string,
  ): Promise<ChatResponseDto> {
    const result = await this.agentService.run(question, userId, sessionId);

    return {
      answer: result.answer,
      model: result.model,
      sources: result.sources,
      steps: result.steps,
      threadId: result.threadId,
      status: result.status,
      pendingAction: result.pendingAction,
    };
  }

  /**
   * Human-in-the-Loop: відновити граф.
   * action='approve' → Command({ resume: 'approve' })
   * action='reject'  → Command({ resume: 'reject', update: { plan: 'direct' } })
   */
  async resumeGraph(
    threadId: string,
    action: 'approve' | 'reject',
    feedback?: string,
  ) {
    if (action === 'approve') {
      return this.agentService.resume(threadId, feedback);
    }
    return this.agentService.reject(threadId, feedback);
  }

  async clearMemory(userId: string = 'default-user'): Promise<void> {
    await this.memory.clearUserMemory(userId);
  }
}
