import { Module } from '@nestjs/common';
import { ChatGateway } from 'src/gateways/chat.gateway';
import { AgentModule } from 'src/modules/agent.module';

/**
 * SocketModule — реєструє WebSocket Gateway та EventEmitter.
 *
 * AgentModule імпортується щоб мати доступ до AgentService через DI.
 * AgentEventEmitter надається як глобальний сервіс щоб AgentService
 * міг інжектувати його для відправки подій.
 */
@Module({
  imports: [AgentModule],
  providers: [ChatGateway],
})
export class SocketModule {}
