import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from 'src/services/llm/LlmService';
import { createModelFactory } from 'src/services/llm/llm.factory';

export const PRIMARY_LLM_TOKEN = 'PRIMARY_LLM';
export const BACKUP_LLM_TOKEN = 'BACKUP_LLM';
export const FAST_LLM_TOKEN = 'FAST_LLM';

@Module({
  providers: [
    {
      provide: PRIMARY_LLM_TOKEN,
      useFactory: createModelFactory('llm.primaryProvider', {
        timeout: 10000,
        maxRetries: 1,
      }),
      inject: [ConfigService],
    },
    {
      provide: BACKUP_LLM_TOKEN,
      useFactory: createModelFactory('llm.backupProvider', { maxRetries: 3 }),
      inject: [ConfigService],
    },
    {
      provide: FAST_LLM_TOKEN,
      useFactory: createModelFactory('llm.fastProvider', {
        temperature: 0,
        maxRetries: 3,
      }),
      inject: [ConfigService],
    },
    LlmService,
  ],
  exports: [LlmService, PRIMARY_LLM_TOKEN, BACKUP_LLM_TOKEN, FAST_LLM_TOKEN],
})
export class LlmModule { }
