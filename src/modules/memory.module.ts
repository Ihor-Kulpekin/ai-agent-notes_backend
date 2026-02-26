import { Module } from '@nestjs/common';
import { TokenCounterService } from 'src/services/memory/token-counter.service';
import { LlmModule } from 'src/modules/llm.module';
import { LongTermMemoryService } from 'src/services/memory/long-term-memory.service';
import { ShortTermMemoryService } from 'src/services/memory/short-term.memory';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';
import { EmbeddedModule } from 'src/modules/embedded.module';
import { OpenSearchRepository } from 'src/repositories/opensearch.repository';

@Module({
  imports: [LlmModule, EmbeddedModule],
  providers: [
    TokenCounterService,
    LongTermMemoryService,
    ShortTermMemoryService,
    MemoryOrchestratorService,
    OpenSearchRepository,
  ],
  exports: [MemoryOrchestratorService],
})
export class MemoryModule {}
