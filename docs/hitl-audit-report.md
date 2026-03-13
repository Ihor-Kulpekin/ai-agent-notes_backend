# Звіт аудиту + реалізація HITL (Human-in-the-Loop)

### ❌ Що було проблемою (5 gaps)

| # | Проблема | Статус |
|---|---------|--------|
| 1 | `resume()` використовував `graph.invoke(null, ...)` — **legacy API**, нестабільний | ✅ Виправлено |
| 2 | Детекція interrupt через `.__interrupt__` — нестабільна перевірка | ✅ Виправлено |
| 3 | Клієнту не поверталося **ім'я tool та args** — не знав що підтверджувати | ✅ Виправлено |
| 4 | Два окремі ендпоінти `/resume/:id` + `/reject/:id` без Zod-валідації body | ✅ Замінено |
| 5 | `buildAgentGraph()` не приймав `fastLlm` — tiered model не лінкувався | ✅ Виправлено |

---

### ✅ Що реалізовано

**`agent.service.ts`:**
- `isInterrupted(result)` — офіційна LangGraph функція замість `.__interrupt__` хаку
- `graph.getState(config)` + `extractPendingAction()` — читає pending tool_calls з останнього AIMessage
- `Command({ resume: 'approve' })` — офіційний API для відновлення
- `Command({ resume: 'reject', update: { plan: 'direct' } })` — reject + state override одночасно
- Optional `feedback` передається у resume value

**`chat.dto.ts`:** `resumeRequestSchema` + `ChatResponseDto` + `ChatPendingActionDto`

**`chat.controller.ts`:** Єдиний ендпоінт `POST /chat/resume` з Zod-валідацією body

---

### 📋 API Contract для фронтенду

**1. Запуск агента:**
```
POST /chat
Body: { message: string, userId?: string, sessionId?: string }

Response (normal):     { success, data: { answer, status: 'completed', threadId, ... } }
Response (HITL pause): { success, data: { status: 'pending_approval', threadId, pendingAction: {
                           toolName: 'summarize',
                           toolArgs: { text: '...' },
                           description: 'Agent wants to call tool "summarize" with args: ...'
                         }}}
```

**2. Відповідь на HITL:**
```
POST /chat/resume
Body: { threadId: string, action: 'approve'|'reject', feedback?: string }

Response: { success, data: { answer, status: 'completed', ... } }
```

**Приклади:**
```json
// Approve без коментаря
{ "threadId": "abc-123", "action": "approve" }

// Reject з поясненням  
{ "threadId": "abc-123", "action": "reject", "feedback": "Не потрібно цей tool" }

// Approve з додатковою інструкцією
{ "threadId": "abc-123", "action": "approve", "feedback": "Зроби стислішим" }
```
