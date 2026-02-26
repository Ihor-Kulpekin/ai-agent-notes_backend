import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { UploadResultDto } from 'src/dto/document.dto';
import { VectorStoreService } from 'src/services/vectore-store/vector-store.service';

@Injectable()
export class DocumentService {
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(private readonly vectorStoreService: VectorStoreService) {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  }

  public async processTextFile(
    content: string,
    filename: string,
  ): Promise<UploadResultDto> {
    // 1. Розбиваємо текст на chunks
    const chunks = await this.textSplitter.splitText(content);

    // 2. Перетворюємо в Document об'єкти (LangChain формат)
    //    metadata — додаткова інформація про кожен chunk
    const documents = chunks.map(
      (chunk, index) =>
        new Document({
          pageContent: chunk,
          metadata: {
            source: filename,
            chunkIndex: index,
            totalChunks: chunks.length,
            uploadedAt: new Date().toISOString(),
          },
        }),
    );

    // 3. Зберігаємо у векторну БД
    //    Всередині: text → embedding (OpenAI) → збереження в OpenSearch
    await this.vectorStoreService.addDocuments(documents);

    return {
      filename,
      chunks: chunks.length,
      message: `File "${filename}" processed: ${chunks.length} chunks indexed`,
    };
  }

  // TODO use correct type instead of any
  async listDocuments(): Promise<any[]> {
    return this.vectorStoreService.listDocuments();
  }

  async deleteDocument(filename: string): Promise<void> {
    await this.vectorStoreService.deleteBySource(filename);
  }
}
