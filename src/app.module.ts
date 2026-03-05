import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from 'src/config/app.config';
import { LlmModule } from 'src/modules/llm.module';
import { ChatModule } from 'src/modules/chat.module';
import { VectorStoreModule } from 'src/modules/vector-store.module';
import { DocumentModule } from 'src/modules/document.module';
import { AgentModule } from 'src/modules/agent.module';
import { HealthModule } from 'src/modules/health.module';
import { MemoryModule } from 'src/modules/memory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    LlmModule,
    VectorStoreModule,
    DocumentModule,
    AgentModule,
    ChatModule,
    HealthModule,
    MemoryModule,
  ],
})
export class AppModule {}
