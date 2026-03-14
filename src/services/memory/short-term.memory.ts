import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { TokenCounterService } from './token-counter.service';
import {
  IChatMessage,
  IConversationSummary,
} from 'src/interfaces/memory/IMemoryModels';
import { MEMORY_SYSTEM_PROMPT } from 'src/constants/prompts';
import { LlmService } from 'src/services/llm/LlmService';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShortTermMemoryService {
  private readonly logger = new Logger(ShortTermMemoryService.name);

  private readonly TTL_SECONDS = 60 * 60 * 24; // 24 hours

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly tokenCounter: TokenCounterService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
  ) { }

  async addMessage(userId: string, message: IChatMessage): Promise<void> {
    const window = await this.getOrCreateWindow(userId);

    if (!message.tokenCount) {
      message.tokenCount = this.tokenCounter.count(message.content);
    }

    window.push(message);
    await this.setWindow(userId, window);

    const currentTokens = this.getWindowTokenCount(window);
    const maxWindowTokens = this.configService.get<number>(
      'stm.maxWindowTokens',
      3000,
    );
    const summarisationThreshold = this.configService.get<number>(
      'stm.summarisationThreshold',
      0.8,
    );

    const threshold = maxWindowTokens * summarisationThreshold;

    if (currentTokens >= threshold) {
      this.logger.log(
        `[${userId}] Window: ${currentTokens}/${maxWindowTokens} tokens → summarising`,
      );
      await this.summarise(userId, maxWindowTokens);
    }
  }

  async getSummary(userId: string): Promise<string | null> {
    const summary = await this.cacheManager.get<IConversationSummary>(
      this.getSummaryKey(userId),
    );
    return summary?.content ?? null;
  }

  async getActiveWindow(userId: string): Promise<IChatMessage[]> {
    const window = await this.getOrCreateWindow(userId);

    // Hard Limit Enforcement
    const maxWindowTokens = this.configService.get<number>(
      'stm.maxWindowTokens',
      3000,
    );
    let currentTokens = this.getWindowTokenCount(window);
    let modified = false;

    // Shift oldest messages if the window exceeds the hard capability limit,
    // ensuring we never send an overflowing context payload to the LLM.
    while (currentTokens > maxWindowTokens && window.length > 1) {
      window.shift(); // Remove the oldest message
      currentTokens = this.getWindowTokenCount(window);
      modified = true;
    }

    if (modified) {
      await this.setWindow(userId, window);
      this.logger.warn(`[${userId}] Hard Cap limit reached: forced window token trim to ${currentTokens} tokens.`);
    }

    return [...window];
  }

  getSystemPrompt(): string {
    return MEMORY_SYSTEM_PROMPT;
  }

  async clear(userId: string): Promise<void> {
    await this.cacheManager.del(this.getWindowKey(userId));
    await this.cacheManager.del(this.getSummaryKey(userId));
    this.logger.log(`[${userId}] STM cleared`);
  }

  private getWindowKey(userId: string): string {
    return `stm:window:${userId}`;
  }

  private getSummaryKey(userId: string): string {
    return `stm:summary:${userId}`;
  }

  private async getOrCreateWindow(userId: string): Promise<IChatMessage[]> {
    let window = await this.cacheManager.get<IChatMessage[]>(
      this.getWindowKey(userId),
    );
    if (!window) {
      window = [];
      await this.setWindow(userId, window);
    }
    return window;
  }

  private async setWindow(
    userId: string,
    window: IChatMessage[],
  ): Promise<void> {
    // TTL в мілісекундах (cache-manager-redis-yet API)
    await this.cacheManager.set(
      this.getWindowKey(userId),
      window,
      this.TTL_SECONDS * 1000,
    );
  }

  private getWindowTokenCount(window: IChatMessage[]): number {
    return this.tokenCounter.countMessages(window);
  }

  private async summarise(
    userId: string,
    maxWindowTokens: number,
  ): Promise<void> {
    const window = await this.getOrCreateWindow(userId);
    if (window.length < 4) return;

    // Token-aware splitting: accumulate oldest messages until we hit ~50% of the max limit
    const targetTokensToSummarise = maxWindowTokens * 0.5;
    let accumulatedTokens = 0;
    let splitIndex = 0;

    for (let i = 0; i < window.length; i++) {
      const msg = window[i];
      const preparedMessageForCountToken =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
      const tokens =
        msg.tokenCount || this.tokenCounter.count(preparedMessageForCountToken);

      if (accumulatedTokens + tokens > targetTokensToSummarise && i > 0) {
        break;
      }
      accumulatedTokens += tokens;
      splitIndex++;
    }

    // Fallback in case of strange calculations
    if (splitIndex === 0) splitIndex = 1;
    if (splitIndex >= window.length) splitIndex = Math.floor(window.length / 2);

    const toSummarise = window.slice(0, splitIndex);
    const remaining = window.slice(splitIndex);

    const existingSummaryObj =
      await this.cacheManager.get<IConversationSummary>(
        this.getSummaryKey(userId),
      );
    const existingSummary = existingSummaryObj?.content ?? '';

    try {
      const newSummary = await this.callSummarisationLlm(
        existingSummary,
        toSummarise,
      );

      const summaryObj: IConversationSummary = {
        content: newSummary,
        tokenCount: this.tokenCounter.count(newSummary),
        coveredUpTo: toSummarise[toSummarise.length - 1].timestamp,
      };

      await this.cacheManager.set(
        this.getSummaryKey(userId),
        summaryObj,
        this.TTL_SECONDS * 1000,
      );

      await this.setWindow(userId, remaining);

      this.logger.log(
        `[${userId}] Summarised ${toSummarise.length} msgs → ` +
        `active: ${remaining.length}, summary tokens: ${summaryObj.tokenCount}`,
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

    return result;
  }
}
