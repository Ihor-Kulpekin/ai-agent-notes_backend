import { Injectable } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddedService {
  private embeddings: OpenAIEmbeddings;

  constructor(private readonly configService: ConfigService) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('openai.apiKey'),
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
