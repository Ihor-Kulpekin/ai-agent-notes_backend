import { Module } from '@nestjs/common';
import { ChatController } from 'src/api/v1/controllers/chat.controller';
import { AgentModule } from 'src/modules/agent.module';
import { ChatService } from 'src/services/chat/chat.service';
import { MemoryModule } from 'src/modules/memory.module';

@Module({
  imports: [AgentModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
