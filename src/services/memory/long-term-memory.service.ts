import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { MEMORY_CONFIG } from 'src/constants/vectore-store';
import { ISemanticSearchResult } from 'src/interfaces/memory/IMemoryModels';
import { EmbeddedService } from 'src/services/embedded/embedded.service';
import { OpenSearchRepository } from 'src/repositories/opensearch.repository';
import { IOpenSearchHit } from 'src/interfaces/repositories/IOpenSearchRepositoryModels';

@Injectable()
export class LongTermMemoryService {
  private readonly logger = new Logger(LongTermMemoryService.name);

  constructor(
    private readonly embeddingService: EmbeddedService,
    private readonly openSearchRepository: OpenSearchRepository,
  ) {}

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Fire-and-forget: зберегти turn без блокування відповіді.
   */
  persistTurn(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    this.indexTurn(userId, sessionId, role, content).catch((err) =>
      this.logger.error(
        `[${userId}] LTM persist failed: ${(err as Error).message}`,
      ),
    );
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
      const documentsLongTermMemory = await this.openSearchRepository.search(
        {
          size: topK,
          query: {
            bool: {
              must: [{ knn: { embedding: { vector: queryVector, k: topK } } }],
              filter: [{ term: { userId } }],
            },
          },
          _source: ['content', 'role', 'timestamp', 'sessionId'],
        },
        indexName,
      );

      return documentsLongTermMemory.map((hit: IOpenSearchHit) => ({
        content: hit._source.content,
        role: hit._source.role,
        score: hit._score,
        timestamp: hit._source.timestamp,
        sessionId: hit._source.sessionId,
      }));
    } catch (error) {
      this.logger.error(
        `[${userId}] LTM search failed: ${(error as Error).message}`,
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

    this.logger.debug(`[${userId}] LTM indexed (${role})`);
  }

  private async embed(text: string): Promise<number[]> {
    const [vector] = await this.embeddingService.embedDocuments([text]);
    return vector;
  }
}
