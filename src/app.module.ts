import { Module } from '@nestjs/common';
import { CoreModule } from 'src/modules/core.module';
import { LlmModule } from 'src/modules/llm.module';
import { ChatModule } from 'src/modules/chat.module';
import { VectorStoreModule } from 'src/modules/vector-store.module';
import { DocumentModule } from 'src/modules/document.module';
import { AgentModule } from 'src/modules/agent.module';
import { MemoryModule } from 'src/modules/memory.module';
import { SocketModule } from 'src/modules/socket.module';
import { AgentEventModule } from 'src/modules/agent-event.module';

@Module({
  imports: [
    CoreModule,
    AgentEventModule,
    LlmModule,
    VectorStoreModule,
    DocumentModule,
    AgentModule,
    ChatModule,
    MemoryModule,
    SocketModule,
  ],
})
export class AppModule {}
