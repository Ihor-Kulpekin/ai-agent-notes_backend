import { Injectable, Logger } from '@nestjs/common';
import { TokenCounterService } from './token-counter.service';
import {
  IChatMessage,
  IConversationSummary,
} from 'src/interfaces/memory/IMemoryModels';
import { MEMORY_CONFIG } from 'src/constants/vectore-store';
import { LlmService } from 'src/services/llm/LlmService';

@Injectable()
export class ShortTermMemoryService {
  private readonly logger = new Logger(ShortTermMemoryService.name);

  private readonly windows = new Map<string, IChatMessage[]>();
  private readonly summaries = new Map<string, IConversationSummary>();

  constructor(
    private readonly tokenCounter: TokenCounterService,
    private readonly llmService: LlmService,
  ) {}

  async addMessage(userId: string, message: IChatMessage): Promise<void> {
    const window = this.getOrCreateWindow(userId);

    if (!message.tokenCount) {
      message.tokenCount = this.tokenCounter.count(message.content);
    }

    window.push(message);

    const currentTokens = this.getWindowTokenCount(userId);
    const threshold =
      MEMORY_CONFIG.maxWindowTokens * MEMORY_CONFIG.summarisationThreshold;

    if (currentTokens >= threshold) {
      this.logger.log(
        `[${userId}] Window: ${currentTokens}/${MEMORY_CONFIG.maxWindowTokens} tokens → summarising`,
      );
      await this.summarise(userId);
    }
  }

  getSummary(userId: string): string | null {
    return this.summaries.get(userId)?.content ?? null;
  }

  getActiveWindow(userId: string): IChatMessage[] {
    return [...(this.windows.get(userId) ?? [])];
  }

  getSystemPrompt(): string {
    return MEMORY_CONFIG.systemPrompt;
  }

  clear(userId: string): void {
    this.windows.delete(userId);
    this.summaries.delete(userId);
    this.logger.log(`[${userId}] STM cleared`);
  }

  private getOrCreateWindow(userId: string) {
    if (!this.windows.has(userId)) {
      this.windows.set(userId, []);
    }
    return this.windows.get(userId)!;
  }

  private getWindowTokenCount(userId: string): number {
    return this.tokenCounter.countMessages(this.getOrCreateWindow(userId));
  }

  private async summarise(userId: string): Promise<void> {
    const window = this.getOrCreateWindow(userId);
    if (window.length < 4) return;

    const splitIndex = Math.ceil(window.length / 2);
    const toSummarise = window.slice(0, splitIndex);
    const remaining = window.slice(splitIndex);

    const existingSummary = this.summaries.get(userId)?.content ?? '';

    try {
      const newSummary = await this.callSummarisationLlm(
        existingSummary,
        toSummarise,
      );

      this.summaries.set(userId, {
        content: newSummary,
        tokenCount: this.tokenCounter.count(newSummary),
        coveredUpTo: toSummarise[toSummarise.length - 1].timestamp,
      });

      this.windows.set(userId, remaining);

      this.logger.log(
        `[${userId}] Summarised ${toSummarise.length} msgs → ` +
          `active: ${remaining.length}, summary tokens: ${this.summaries.get(userId)!.tokenCount}`,
      );
    } catch (error) {
      this.logger.error(
        `[${userId}] Summarisation failed: ${(error as Error).message}`,
      );
    }
  }

  private async callSummarisationLlm(
    existingSummary: string,
    messages: IChatMessage[],
  ): Promise<string> {
    const conversationBlock = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    const userPrompt = existingSummary
      ? `Below is the existing summary followed by new messages. Produce an updated, concise summary preserving all key facts and decisions. Under 300 words, third-person.

EXISTING SUMMARY:
${existingSummary}

NEW MESSAGES:
${conversationBlock}`
      : `Produce a concise summary of the following conversation. Capture all key facts, decisions, and context. Under 300 words, third-person.

MESSAGES:
${conversationBlock}`;

    const result = await this.llmService.invoke(
      'You summarise conversations accurately and concisely. Return only the summary, nothing else.',
      userPrompt,
    );

    return result as string;
  }
}
