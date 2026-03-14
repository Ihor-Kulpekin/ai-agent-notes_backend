import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { INDEX_NAME, MEMORY_CONFIG } from 'src/constants/vector-store';
import { IAggBucket } from 'src/interfaces/vector-store/IVectorStoreServiceModels';
import {
  Index_Request,
  Search_RequestBody,
} from '@opensearch-project/opensearch/api/index.js';
import {
  indexCreationDocument,
  indexLongTermMemoryCreation,
} from 'src/constants/indexes-creating.constants';
import { ISearchRepository } from 'src/interfaces/repositories/ISearchRepository';

@Injectable()
export class OpenSearchRepository implements OnModuleInit, ISearchRepository {
  private openSearchClient: Client;
  private readonly logger = new Logger(OpenSearchRepository.name);

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    this.openSearchClient = new Client({
      node:
        this.configService.get<string>('opensearch.url') ||
        'http://localhost:9200',
    });

    await this.initializeIndexes();
    this.logger.log('OpenSearch repository initialized');
  }

  private async initializeIndexes(): Promise<void> {
    await this.createIndexIfNotExists(indexCreationDocument, INDEX_NAME);
    await this.createIndexIfNotExists(
      indexLongTermMemoryCreation,
      MEMORY_CONFIG.ltmIndexName,
    );
  }

  /**
   * Bulk insert документів в індекс.
   */
  async bulkIndex<T extends Record<string, any>>(
    documents: T[],
    index = INDEX_NAME,
  ): Promise<void> {
    const body: Record<string, any>[] = [];

    documents.forEach((doc) => {
      body.push({ index: { _index: index } });
      body.push(doc);
    });

    const response = await this.openSearchClient.bulk({
      body,
      // P2 Bottleneck fix: 'wait_for' є частиною bulk request —
      // чекаємо поки зміни стануть видимими для пошуку.
      // На відміну від ручного this.refresh() це неблокуюча операція
      // для паралельних uploads.
      refresh: 'wait_for',
    });

    if (response.body.errors) {
      this.logger.error(
        'Bulk indexing errors:',
        JSON.stringify(response.body.items),
      );
      throw new Error('Failed to index some documents');
    }

    await this.refresh();
  }

  async index(data: Index_Request): Promise<void> {
    await this.openSearchClient.index(data);
  }

  /**
   * k-NN пошук по вектору.
   */
  async knnSearch<T>(
    vector: number[],
    k: number,
    index = INDEX_NAME,
  ): Promise<T[]> {
    return this.knnSearchWithFilter<T>(vector, k, [], [], index);
  }

  /**
   * k-NN пошук по вектору з фільтрами (Efficient k-NN Pre-filtering).
   */
  async knnSearchWithFilter<T>(
    vector: number[],
    k: number,
    filters: Record<string, unknown>[] = [],
    sourceFields: string[] = [],
    index = INDEX_NAME,
  ): Promise<T[]> {
    const knnEmbedding: Record<string, unknown> = {
      vector,
      k,
    };

    if (filters.length > 0) {
      knnEmbedding.filter = {
        bool: {
          must: filters,
        },
      };
    }

    const body: Record<string, unknown> = {
      size: k,
      query: {
        knn: {
          embedding: knnEmbedding,
        },
      },
    };

    if (sourceFields.length > 0) {
      body._source = sourceFields;
    }

    const response = await this.openSearchClient.search({
      index,
      body,
    });

    return response.body.hits.hits as T[];
  }

  async search<T>(body: unknown, index = INDEX_NAME): Promise<T[]> {
    const response = await this.openSearchClient.search({
      index,
      body: body as Search_RequestBody,
    });

    return response.body.hits.hits as T[];
  }

  /**
   * Гібридний пошук: kNN (вектори) + BM25 (повнотекстовий).
   * Використовує мануальний Reciprocal Rank Fusion (RRF) замість лінійної комбінації скорів.
   */
  async hybridSearch<T>(
    queryText: string,
    vector: number[],
    k: number,
    index = INDEX_NAME,
  ): Promise<T[]> {
    // 1. Keyword search (BM25)
    const textQuery = {
      size: k * 2, // Отримуємо більше результатів для кращого fusion
      query: {
        match: {
          content: queryText,
        },
      },
    };

    // 2. Semantic search (kNN)
    const knnQuery = {
      size: k * 2,
      query: {
        knn: {
          embedding: {
            vector,
            k: k * 2,
          },
        },
      },
    };

    const [textResponse, knnResponse] = await Promise.all([
      this.openSearchClient.search({ index, body: textQuery as Search_RequestBody }),
      this.openSearchClient.search({ index, body: knnQuery as Search_RequestBody }),
    ]);

    const textHits = textResponse.body.hits.hits as { _id: string; _source: any }[];
    const knnHits = knnResponse.body.hits.hits as { _id: string; _source: any }[];

    // 3. Reciprocal Rank Fusion
    const rrfScores = new Map<string, { doc: any; rrfScore: number }>();
    const RRF_CONSTANT = 60; // Стандартна константа для RRF

    textHits.forEach((hit, rank) => {
      rrfScores.set(hit._id, {
        doc: hit,
        rrfScore: 1.0 / (RRF_CONSTANT + rank + 1), // rank is 0-indexed
      });
    });

    knnHits.forEach((hit, rank) => {
      const existing = rrfScores.get(hit._id);
      const score = 1.0 / (RRF_CONSTANT + rank + 1);
      if (existing) {
        existing.rrfScore += score;
      } else {
        rrfScores.set(hit._id, {
          doc: hit,
          rrfScore: score,
        });
      }
    });

    // 4. Sort and return top-K
    const fusedResults = Array.from(rrfScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, k)
      .map((item) => {
        // Замінюємо оригінальний score на rrfScore для подальшого використання
        const docWithScore = { ...item.doc, _score: item.rrfScore };
        return docWithScore as T;
      });

    return fusedResults;
  }

  async deleteBySource(
    filename: string,
    query: Record<string, unknown>,
    index: string,
  ): Promise<void> {
    await this.openSearchClient.deleteByQuery({
      index,
      body: {
        query: {
          ...query,
        },
      },
    });

    await this.refresh(index);
    this.logger.log(`Deleted all chunks for "${filename}"`);
  }

  //TODO try to do unique for all indexes
  /**
   * Aggregation: список унікальних source з кількістю chunks.
   */
  async aggregateBySource(): Promise<IAggBucket[]> {
    const indexExists = await this.openSearchClient.indices.exists({
      index: INDEX_NAME,
    });
    if (!indexExists.body) return [];

    const response = await this.openSearchClient.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          sources: {
            terms: {
              field: 'metadata.source.keyword',
              size: 100,
            },
            aggs: {
              latest_upload: {
                max: {
                  field: 'metadata.uploadedAt.keyword',
                },
              },
            },
          },
        },
      },
    });

    const aggregations = response.body?.aggregations as
      | { sources?: { buckets?: IAggBucket[] } }
      | undefined;

    return aggregations?.sources?.buckets || [];
  }

  public async createIndexIfNotExists(
    body: Record<string, unknown>,
    indexName = INDEX_NAME,
  ): Promise<void> {
    const exists = await this.openSearchClient.indices.exists({
      index: indexName,
    });
    if (exists.body) return;

    await this.openSearchClient.indices.create({
      index: indexName,
      body,
    });

    this.logger.log(`Index "${INDEX_NAME}" created`);
  }

  private async refresh(indexName = INDEX_NAME): Promise<void> {
    await this.openSearchClient.indices.refresh({ index: indexName });
  }
}
