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

  async ask(question: string, userId: string): Promise<ChatResponseDto> {
    const result = await this.agentService.run(question, userId);

    return {
      answer: result.answer,
      model: result.model,
      sources: result.sources,
      steps: result.steps,
    };
  }

  clearMemory(userId: string = 'default-user'): void {
    this.memory.clearUserMemory(userId);
  }
}
