import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import type {
  WsAgentStepEvent,
  WsAgentInterruptEvent,
  WsAgentDoneEvent,
  WsAgentErrorEvent,
} from 'src/interfaces/ws/ws-events.interface';

/**
 * AgentEventEmitter — єдиний посередник між AgentService та WebSocket-шлюзом.
 *
 * Архітектура: AgentService → AgentEventEmitter → socket.io Server → клієнт
 *
 * Чому окремий сервіс:
 * - Уникаємо circular dependency (AgentService ↔ ChatGateway)
 * - ChatGateway реєструє io сервер тут після ініціалізації
 * - AgentService залежить тільки від цього легкого сервісу (не від Gateway)
 */
@Injectable()
export class AgentEventEmitter {
  private readonly logger = new Logger(AgentEventEmitter.name);
  private io: Server | null = null;

  /**
   * Викликається з ChatGateway.afterInit() щоб передати socket.io Server.
   */
  registerServer(server: Server): void {
    this.io = server;
    this.logger.log('Socket.io server registered in AgentEventEmitter');
  }

  /**
   * `agent:step` — нода завершила роботу.
   * Клієнт може показувати прогрес у real-time.
   */
  emitStep(threadId: string, payload: WsAgentStepEvent): void {
    this.io?.to(threadId).emit('agent:step', payload);
  }

  /**
   * `agent:interrupt` — граф зупинився перед tools_executor.
   * Клієнт ПОВИНЕН показати confirmation dialog і надіслати 'chat:resume'.
   */
  emitInterrupt(threadId: string, payload: WsAgentInterruptEvent): void {
    this.logger.log(`Emitting agent:interrupt to room "${threadId}"`);
    this.io?.to(threadId).emit('agent:interrupt', payload);
  }

  /**
   * `agent:done` — граф завершив роботу, відповідь готова.
   */
  emitDone(threadId: string, payload: WsAgentDoneEvent): void {
    this.io?.to(threadId).emit('agent:done', payload);
  }

  /**
   * `agent:error` — помилка під час виконання агента.
   */
  emitError(threadId: string, payload: WsAgentErrorEvent): void {
    this.logger.error(
      `Agent error in thread "${threadId}": ${payload.message}`,
    );
    this.io?.to(threadId).emit('agent:error', payload);
  }
}
