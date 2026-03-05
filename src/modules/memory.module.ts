import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { TokenCounterService } from 'src/services/memory/token-counter.service';
import { LlmModule } from 'src/modules/llm.module';
import { LongTermMemoryService } from 'src/services/memory/long-term-memory.service';
import { ShortTermMemoryService } from 'src/services/memory/short-term.memory';
import { MemoryOrchestratorService } from 'src/services/memory/memory-orchestrator.service';
import { EmbeddedModule } from 'src/modules/embedded.module';
import { OpenSearchModule } from 'src/modules/opensearch.module';

@Module({
  imports: [
    LlmModule,
    EmbeddedModule,
    OpenSearchModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          url: configService.get<string>('redis.url', 'redis://localhost:6379'),
        }),
      }),
    }),
  ],
  providers: [
    TokenCounterService,
    LongTermMemoryService,
    ShortTermMemoryService,
    MemoryOrchestratorService,
  ],
  exports: [MemoryOrchestratorService],
})
export class MemoryModule {}
