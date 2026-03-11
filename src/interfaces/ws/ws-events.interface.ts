/**
 * WebSocket Event Payloads — агент → клієнт
 *
 * Фронтенд підписується на ці події через socket.io:
 *   socket.on('agent:step', handler)
 *   socket.on('agent:interrupt', handler)
 *   socket.on('agent:done', handler)
 *   socket.on('agent:error', handler)
 */

/** Один крок виконання графа (нода завершила роботу) */
export interface WsAgentStepEvent {
  threadId: string;
  /** Назва вузла, що завершив роботу: 'planner' | 'search' | 'generator' | ... */
  node: string;
  /** Короткий опис що відбулося на цьому кроці */
  summary?: string;
}

/** Граф зупинився і чекає на підтвердження людини */
export interface WsAgentInterruptEvent {
  threadId: string;
  node: 'tools_executor';
  /** Ім'я tool, яку хоче виконати агент */
  toolName: string;
  /** Аргументи tool */
  toolArgs: unknown;
  /** Людино-читабельний опис */
  description: string;
}

/** Граф завершив роботу, відповідь готова */
export interface WsAgentDoneEvent {
  threadId: string;
  answer: string;
  sources: Array<{ source: string; preview: string }>;
  steps: string[];
  model: string;
}

/** Виникла помилка під час виконання графа */
export interface WsAgentErrorEvent {
  threadId: string;
  message: string;
}

// ── Клієнт → Сервер ──────────────────────────────────────────

/** Запустити агента */
export interface WsChatMessagePayload {
  message: string;
  userId?: string;
  threadId?: string; // якщо є — continue existing thread
}

/** Відповідь на HITL pause */
export interface WsResumePayload {
  threadId: string;
  action: 'approve' | 'reject';
  feedback?: string;
}
