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

  constructor(private readonly configService: ConfigService) {}

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

    const response = await this.openSearchClient.bulk({ body });

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
   * k-NN пошук по вектору з фільтрами.
   */
  async knnSearchWithFilter<T>(
    vector: number[],
    k: number,
    filters: Record<string, unknown>[] = [],
    sourceFields: string[] = [],
    index = INDEX_NAME,
  ): Promise<T[]> {
    const query: Record<string, unknown> = {
      knn: {
        embedding: {
          vector,
          k,
        },
      },
    };

    const finalQuery: Record<string, unknown> =
      filters.length > 0
        ? {
            bool: {
              must: [query],
              filter: filters,
            },
          }
        : query;

    const body: Record<string, unknown> = {
      size: k,
      query: finalQuery,
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
