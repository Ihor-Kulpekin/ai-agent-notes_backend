import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { OpenSearchRepository } from 'src/repositories/opensearch.repository';
import { EmbeddedService } from 'src/services/embedded/embedded.service';
import { IIndexDocumentData } from 'src/interfaces/repositories/IOpenSearchRepositoryModels';
import { IOpenSearchHit } from 'src/interfaces/vector-store/IVectorStoreServiceModels';
import { INDEX_NAME } from 'src/constants/vectore-store';

@Injectable()
export class VectorStoreService {
  constructor(
    private readonly repository: OpenSearchRepository,
    private readonly embeddedService: EmbeddedService,
  ) {}

  public async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map((docItem) => docItem.pageContent);
    const vectors = await this.embeddedService.embedDocuments(texts);

    const indexData: IIndexDocumentData[] = documents.map((doc, i) => ({
      content: doc.pageContent,
      embedding: vectors[i],
      metadata: doc.metadata as Record<string, unknown>,
    }));

    await this.repository.bulkIndex<IIndexDocumentData>(indexData);
    console.log(`Indexed ${documents.length} documents`);
  }

  /**
   * Пошук схожих документів по змісту (similarity search).
   * 1. Перетворює питання в вектор (embedding)
   * 2. Шукає найближчі вектори в OpenSearch (k-NN)
   * 3. Повертає знайдені фрагменти як LangChain Document
   */
  public async similaritySearch(
    query: string,
    k: number = 4,
    index = INDEX_NAME,
  ): Promise<Document[]> {
    const queryVector = await this.embeddedService.embedQuery(query);
    const hits = await this.repository.knnSearch<IOpenSearchHit>(
      queryVector,
      k,
      index,
    );

    return hits.map(
      (hit) =>
        new Document({
          pageContent: hit._source.content,
          metadata: {
            ...hit._source.metadata,
            score: hit._score,
          },
        }),
    );
  }

  async deleteBySource(filename: string, index = INDEX_NAME): Promise<void> {
    await this.repository.deleteBySource(
      filename,
      {
        term: {
          'metadata.source.keyword': filename,
        },
      },
      index,
    );
  }

  /**
   * Повертає список унікальних документів з кількістю chunks.
   * Використовує OpenSearch aggregation по полю metadata.source.
   */
  async listDocuments(): Promise<
    Array<{ filename: string; chunks: number; uploadedAt: string }>
  > {
    const buckets = await this.repository.aggregateBySource();

    return buckets.map((bucket) => ({
      filename: bucket.key,
      chunks: bucket.doc_count,
      uploadedAt: bucket.latest_upload?.value_as_string || '',
    }));
  }
}
