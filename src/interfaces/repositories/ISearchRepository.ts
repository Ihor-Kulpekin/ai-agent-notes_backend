import { IAggBucket } from 'src/interfaces/vector-store/IVectorStoreServiceModels';
import { Index_Request } from '@opensearch-project/opensearch/api/index.js';

export interface ISearchRepository {
  bulkIndex<T extends Record<string, any>>(
    documents: T[],
    index?: string,
  ): Promise<void>;
  index(data: Index_Request): Promise<void>;
  knnSearch<T>(vector: number[], k: number, index?: string): Promise<T[]>;
  knnSearchWithFilter<T>(
    vector: number[],
    k: number,
    filters?: Record<string, unknown>[],
    sourceFields?: string[],
    index?: string,
  ): Promise<T[]>;
  hybridSearch<T>(
    queryText: string,
    vector: number[],
    k: number,
    index?: string,
  ): Promise<T[]>;
  search<T>(body: unknown, index?: string): Promise<T[]>;
  deleteBySource(
    filename: string,
    query: Record<string, unknown>,
    index: string,
  ): Promise<void>;
  aggregateBySource(): Promise<IAggBucket[]>;
  createIndexIfNotExists(
    body: Record<string, unknown>,
    indexName?: string,
  ): Promise<void>;
}
