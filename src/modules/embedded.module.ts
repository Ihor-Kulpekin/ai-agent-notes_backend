import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddedService } from 'src/services/embedded/embedded.service';
import { createEmbeddingsModelFactory } from 'src/services/embedded/embeddings.factory';

export const EMBEDDINGS_MODEL_TOKEN = 'EMBEDDINGS_MODEL';

@Module({
  providers: [
    {
      provide: EMBEDDINGS_MODEL_TOKEN,
      useFactory: createEmbeddingsModelFactory('llm.embeddingsProvider', {}),
      inject: [ConfigService],
    },
    EmbeddedService,
  ],
  exports: [EmbeddedService, EMBEDDINGS_MODEL_TOKEN],
})
export class EmbeddedModule { }
