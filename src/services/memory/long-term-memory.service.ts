import { Injectable, Logger, Inject } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { MEMORY_CONFIG } from 'src/constants/vector-store';
import { ISemanticSearchResult } from 'src/interfaces/memory/IMemoryModels';
import { EmbeddedService } from 'src/services/embedded/embedded.service';
import type { ISearchRepository } from 'src/interfaces/repositories/ISearchRepository';
import { IMemorySearchHit } from 'src/interfaces/repositories/IOpenSearchRepositoryModels';

@Injectable()
export class LongTermMemoryService {
  private readonly logger = new Logger(LongTermMemoryService.name);

  constructor(
    private readonly embeddedService: EmbeddedService,
    @Inject('ISearchRepository')
    private readonly openSearchRepository: ISearchRepository,
  ) {}

  /**
   * Fire-and-forget: зберегти turn без блокування відповіді.
   *
   * @param content - якщо undefined/null/пустий — збереження тихо ігнорується
   */
  persistTurn(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string | undefined | null,
  ): void {
    if (!content?.trim()) {
      this.logger.debug(
        `[${userId}] LTM persist skipped: empty content (${role})`,
      );
      return;
    }
    this.persistTurnWithRetry(userId, sessionId, role, content).catch((err) =>
      this.logger.error(
        `[${userId}] LTM persist completely failed: ${(err as Error).message}`,
      ),
    );
  }

  private async persistTurnWithRetry(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    retries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.indexTurn(userId, sessionId, role, content);
        return;
      } catch (error) {
        this.logger.warn(
          `[${userId}] LTM persist failed, attempt ${attempt}/${retries}: ${(error as Error).message}`,
        );
        if (attempt === retries) throw error;

        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  /**
   * Семантичний пошук: kNN + фільтр по userId.
   */
  async search(
    userId: string,
    query: string,
    topK: number = MEMORY_CONFIG.ltmTopK,
  ): Promise<ISemanticSearchResult[]> {
    try {
      const queryVector = await this.embed(query);
      const indexName = MEMORY_CONFIG.ltmIndexName;

      const documentsLongTermMemory =
        await this.openSearchRepository.knnSearchWithFilter<IMemorySearchHit>(
          queryVector,
          topK,
          [{ term: { userId } }],
          ['content', 'role', 'timestamp', 'sessionId'],
          indexName,
        );

      return documentsLongTermMemory.map((hit: IMemorySearchHit) => ({
        content: hit._source.content,
        role: hit._source.role,
        score: hit._score,
        timestamp: hit._source.timestamp,
        sessionId: hit._source.sessionId,
      }));
    } catch (error) {
      this.logger.error(
        `[${userId}] LTM search failed: ${(error as Error).message} `,
      );
      return [];
    }
  }

  private async indexTurn(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    // Додатковий запобіжник: не дозволяємо порожньому вмісту потрапити в embed()
    if (!content?.trim()) {
      this.logger.debug(
        `[${userId}] indexTurn skipped: empty content (${role})`,
      );
      return;
    }
    const embedding = await this.embed(content);
    const index = MEMORY_CONFIG.ltmIndexName;
    const data = {
      index,
      id: uuid(),
      body: {
        content,
        embedding,
        userId,
        sessionId,
        role,
        timestamp: Date.now(),
      },
      refresh: false,
    };

    await this.openSearchRepository.index(data);

    this.logger.debug(`[${userId}] LTM indexed(${role})`);
  }

  private async embed(text: string): Promise<number[]> {
    return this.embeddedService.embedQuery(text);
  }
}
