import { Module } from '@nestjs/common';
import { LlmService } from 'src/services/llm/LlmService';

@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}