import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AgentService } from 'src/services/agent/agent.service';
import { AgentEventEmitter } from 'src/gateways/agent-event.emitter';
import type {
  WsChatMessagePayload,
  WsResumePayload,
} from 'src/interfaces/ws/ws-events.interface';

/**
 * ChatGateway — WebSocket шлюз для real-time взаємодії з агентом.
 *
 * Namespace: /chat
 * URL: ws://localhost:3000/chat
 *
 * ROOMS:
 *   Кожен клієнт підключається і одразу приєднується до кімнати зі своїм threadId.
 *   Це дозволяє емітити події лише конкретному клієнту (не broadcast всім).
 *
 * CLIENT → SERVER:
 *   'chat:message'  — запустити агента
 *   'chat:resume'   — відновити або скасувати після HITL interrupt
 *   'chat:join'     — приєднатися до room (якщо threadId вже відомий)
 *
 * SERVER → CLIENT:
 *   'agent:step'       — нода завершила роботу (прогрес)
 *   'agent:interrupt'  — граф зупинився, потрібне підтвердження людини
 *   'agent:done'       — граф завершив роботу, відповідь готова
 *   'agent:error'      — помилка під час виконання
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*', // Налаштуйте для production
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly eventEmitter: AgentEventEmitter,
  ) {}

  /**
   * Реєструємо socket.io Server в AgentEventEmitter після ініціалізації шлюза.
   * Це дозволяє AgentService емітити події без прямої залежності від Gateway.
   */
  afterInit(server: Server): void {
    this.eventEmitter.registerServer(server);
    this.logger.log(
      'ChatGateway initialized — WebSocket server ready on /chat',
    );
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('agent:connected', {
      status: 'ok',
      serverTime: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 'chat:join' — клієнт приєднується до room по threadId.
   * Корисно коли треба відновити вже існуючий thread після reconnect.
   *
   * Client sends: { threadId: string }
   * Server emits: 'chat:joined' → { threadId }
   */
  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { threadId: string },
  ): Promise<void> {
    if (!payload?.threadId) return;
    await client.join(payload.threadId);
    client.emit('chat:joined', { threadId: payload.threadId });
    this.logger.log(
      `Client ${client.id} joined room "${payload.threadId}" | rooms: ${JSON.stringify([...client.rooms])}`,
    );
  }

  /**
   * 'chat:message' — запустити агента в streaming режимі.
   *
   * Client sends: WsChatMessagePayload
   * Server emits sequence: agent:step+ → (agent:interrupt | agent:done) | agent:error
   *
   * Клієнт отримує threadId в першому agent:step або agent:done,
   * після чого може використовувати його для resume.
   */
  @SubscribeMessage('chat:message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: WsChatMessagePayload,
  ): Promise<void> {
    const { message, userId = 'default-user', threadId } = payload;

    try {
      // Запускаємо streaming — AgentService сам емітує events через AgentEventEmitter
      // client.join(threadId) викликається всередині stream() перед graph.stream()
      await this.agentService.stream(message, userId, threadId, client);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Agent stream error for thread "${threadId}": ${errMsg}`,
      );
      client.emit('agent:error', { threadId: threadId ?? '', message: errMsg });
    }
  }

  /**
   * 'chat:resume' — відновити або скасувати HITL після interrupt.
   *
   * Client sends: WsResumePayload
   * Server emits: agent:step+ → agent:done | agent:error
   */
  @SubscribeMessage('chat:resume')
  async handleResume(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: WsResumePayload,
  ): Promise<void> {
    const { threadId, action, feedback } = payload;

    if (!threadId || !action) {
      client.emit('agent:error', {
        threadId: threadId ?? '',
        message: 'threadId and action are required for resume',
      });
      return;
    }

    try {
      await this.agentService.streamResume(threadId, action, feedback, client);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      client.emit('agent:error', { threadId, message: errMsg });
    }
  }
}
