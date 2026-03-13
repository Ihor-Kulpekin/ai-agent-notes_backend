import { Injectable, Inject } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EMBEDDINGS_MODEL_TOKEN } from 'src/modules/embedded.module';

@Injectable()
export class EmbeddedService {
  constructor(
    @Inject(EMBEDDINGS_MODEL_TOKEN)
    private readonly embeddings: OpenAIEmbeddings,
  ) { }

  public async embedDocuments(texts: string[]) {
    return this.embeddings.embedDocuments(texts);
  }

  public async embedQuery(query: string) {
    return this.embeddings.embedQuery(query);
  }
}

