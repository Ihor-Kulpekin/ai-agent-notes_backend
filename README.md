# notesQa — AI Agent Backend

NestJS + LangGraph + OpenSearch backend with Human-in-the-Loop support via WebSockets.

---

## 🚀 Quick Start — Infrastructure

```bash
# Підняти Redis Stack (LangGraph checkpointer + RedisInsight UI)
docker compose up -d

# RedisInsight UI доступний на http://localhost:8001
```

> **Вимоги:** Docker Desktop ≥ 4.x

---

## 🔧 Environment

Скопіюй `.env.example` → `.env` та заповни змінні:

```env
OPENAI_API_KEY=sk-...
REDIS_URL=redis://localhost:6379
OPENSEARCH_URL=http://localhost:9200
```

---

## 📡 WebSocket API

Namespace: `ws://localhost:3000/chat`

| Подія (client → server) | Призначення |
|--------------------------|-------------|
| `chat:message` | Запустити агента |
| `chat:resume` | Підтвердити / відхилити HITL action |
| `chat:join` | Підписатися на кімнату threadId |

| Подія (server → client) | Призначення |
|--------------------------|-------------|
| `agent:step` | Нода завершила роботу |
| `agent:interrupt` | Потрібне підтвердження людини |
| `agent:done` | Відповідь готова |
| `agent:error` | Помилка виконання |

Детальний контракт у [`websocket-ai.md`](./websocket-ai.md).

---

## 🧪 Development

```bash
npm install
npm run start:dev
```
