import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import {
  INDEX_NAME,
  MEMORY_CONFIG,
  VECTOR_DIMENSION,
} from 'src/constants/vectore-store';
import { IAggBucket } from 'src/interfaces/vector-store/IVectorStoreServiceModels';
import {
  Index_Request,
  Search_RequestBody,
} from '@opensearch-project/opensearch/api/index.js';

@Injectable()
export class OpenSearchRepository implements OnModuleInit {
  private openSearchClient: Client;

  async onModuleInit() {
    this.openSearchClient = new Client({
      node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
    });

    await this.createIndexIfNotExists(
      {
        settings: {
          'index.knn': true,
        },
        mappings: {
          properties: {
            embedding: {
              type: 'knn_vector',
              dimension: VECTOR_DIMENSION,
              method: {
                name: 'hnsw',
                space_type: 'cosinesimil',
                engine: 'lucene',
              },
            },
            content: {
              type: 'text',
            },
            metadata: {
              type: 'object',
              enabled: true,
            },
          },
        },
      },
      INDEX_NAME,
    );
    await this.createIndexIfNotExists(
      {
        index: MEMORY_CONFIG.ltmIndexName,
        body: {
          settings: {
            'index.knn': true,
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: {
            properties: {
              embedding: {
                type: 'knn_vector',
                dimension: MEMORY_CONFIG.embeddingDimension,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'lucene',
                },
              },
              content: { type: 'text' },
              userId: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              role: { type: 'keyword' },
              timestamp: { type: 'long' },
            },
          },
        },
      },
      MEMORY_CONFIG.ltmIndexName,
    );
    console.log('OpenSearch repository initialized');
  }

  /**
   * Bulk insert документів в індекс.
   */
  async bulkIndex<T>(documents: T[], index = INDEX_NAME): Promise<void> {
    const body: any[] = [];

    documents.forEach((doc) => {
      body.push({ index: { _index: index } });
      body.push(doc);
    });

    const response = await this.openSearchClient.bulk({ body });

    if (response.body.errors) {
      console.error(
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
    const response = await this.openSearchClient.search({
      index,
      body: {
        size: k,
        query: {
          knn: {
            embedding: {
              vector,
              k,
            },
          },
        },
      },
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
    console.log(`Deleted all chunks for "${filename}"`);
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

    console.log(`Index "${INDEX_NAME}" created`);
  }

  private async refresh(indexName = INDEX_NAME): Promise<void> {
    await this.openSearchClient.indices.refresh({ index: indexName });
  }
}
