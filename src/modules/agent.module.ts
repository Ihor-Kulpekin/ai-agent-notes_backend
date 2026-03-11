import { Module } from '@nestjs/common';
import { AgentService } from 'src/services/agent/agent.service';
import { LlmModule } from 'src/modules/llm.module';
import { VectorStoreModule } from 'src/modules/vector-store.module';
import { MemoryModule } from 'src/modules/memory.module';
import { CheckpointerModule } from 'src/modules/checkpointer.module';

@Module({
  imports: [LlmModule, VectorStoreModule, MemoryModule, CheckpointerModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
