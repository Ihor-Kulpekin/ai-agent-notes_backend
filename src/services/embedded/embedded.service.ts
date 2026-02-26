import { Injectable } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class EmbeddedService {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    });
  }

  public async embedDocuments(texts: string[]) {
    return this.embeddings.embedDocuments(texts);
  }

  public async embedQuery(query: string) {
    return this.embeddings.embedQuery(query);
  }
}
