import { Injectable, Logger } from '@nestjs/common';
import { LongTermMemoryService } from './long-term-memory.service';
import { ShortTermMemoryService } from 'src/services/memory/short-term.memory';
import {
  IFinalPromptContext,
  ISemanticSearchResult,
} from 'src/interfaces/memory/IMemoryModels';

@Injectable()
export class MemoryOrchestratorService {
  private readonly logger = new Logger(MemoryOrchestratorService.name);

  constructor(
    private readonly stm: ShortTermMemoryService,
    private readonly ltm: LongTermMemoryService,
  ) {}

  async constructFinalPrompt(
    userId: string,
    userMessage: string,
    sessionId: string = 'default',
  ): Promise<IFinalPromptContext> {
    // 1. RAG по минулих розмовах
    const ltmResults = await this.searchLtm(userId, userMessage);

    // 2. Стан STM
    const summary = await this.stm.getSummary(userId);
    const activeWindow = await this.stm.getActiveWindow(userId);

    // 3. Зберегти в STM (може тригернути summarisation)
    await this.stm.addMessage(userId, {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    // 4. Fire-and-forget: зберегти в LTM
    this.ltm.persistTurn(userId, sessionId, 'user', userMessage);

    const context: IFinalPromptContext = {
      systemPrompt: this.stm.getSystemPrompt(),
      longTermMemory: ltmResults,
      summary,
      activeWindow,
      currentUserMessage: userMessage,
    };

    this.logger.log(
      `[${userId}] Prompt built — LTM: ${ltmResults.length}, ` +
        `summary: ${summary ? 'yes' : 'no'}, window: ${activeWindow.length} msgs`,
    );

    return context;
  }

  async recordAssistantResponse(
    userId: string,
    assistantMessage: string,
    sessionId: string = 'default',
  ): Promise<void> {
    await this.stm.addMessage(userId, {
      role: 'assistant',
      content: assistantMessage,
      timestamp: Date.now(),
    });
    this.ltm.persistTurn(userId, sessionId, 'assistant', assistantMessage);
  }

  toMessageArray(
    context: IFinalPromptContext,
  ): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [];

    let systemBlock = context.systemPrompt;

    if (context.longTermMemory.length > 0) {
      const ltmBlock = context.longTermMemory
        .map(
          (r) =>
            `[${new Date(r.timestamp).toISOString()}] (${r.role}): ${r.content}`,
        )
        .join('\n');
      systemBlock += `\n\n## Relevant Past Conversations\n${ltmBlock}`;
    }

    if (context.summary) {
      systemBlock += `\n\n## Earlier Conversation Summary\n${context.summary}`;
    }

    messages.push({ role: 'system', content: systemBlock });

    for (const msg of context.activeWindow) {
      if (msg.role === 'system') continue;
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: context.currentUserMessage });

    return messages;
  }

  async clearUserMemory(userId: string): Promise<void> {
    await this.stm.clear(userId);
    this.logger.log(`[${userId}] All memory cleared`);
  }

  private async searchLtm(
    userId: string,
    query: string,
  ): Promise<ISemanticSearchResult[]> {
    try {
      return this.ltm.search(userId, query);
    } catch (error) {
      this.logger.warn(
        `[${userId}] LTM unavailable: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
