# Phase 3: AI Engine (LangGraph Layer) - Architectural Audit

## 1. Аудит Стейту та Модульності (AgentState & Nodes)

### AgentState
Типізація стану графі (`AgentState`) реалізована відмінно. Використано `Annotation.Root` з коректними редьюсерами. Особливо варто відзначити правильний редьюсер для `retryCount: (current, update) => current + update`, що сумує спроби, та використання `messagesStateReducer` для масиву повідомлень.

### Модульність Графа
Файл `agent.graph.ts` **НЕ є гігантським 'God Object'**. Відповідальність жорстко і правильно розділена: логіка кожної ноди інкапсульована у відповідних файлах в директорії `nodes/` (наприклад, `createGeneratorNode`, `createToolsCallerNode`), а логіка переходів винесена в `router/`. Це зразковий підхід (Clean Architecture), який дозволяє легко проводити Unit-тестування кожної ноди ізольовано від графа.

---

## 2. Аудит Відмовостійкості (Tools & Fallbacks)

### Моделі та Маршрутизація
Використання моделей ідеально поділено за призначенням (Tiered Model Strategy):
- `classifierLlm` (Fast LLM, зазвичай gpt-4o-mini) ефективно використовується для легких задач: `planner`, `query_rewriter`, `grader`, `tools_result`.
- `llmWithFallbacks` (Primary LLM, зазвичай gpt-4o) використовується для найважливішої ноди — `generator`.

### Патерн 'Bind first, Fallback second'
Для `tools_caller` цей патерн реалізований абсолютно вірно:
```typescript
const primaryWithTools = llmRaw.bindTools(tools);
const backupWithTools = fastLlm ? fastLlm.bindTools(tools) : primaryWithTools;
const llmWithToolsAndFallbacks = primaryWithTools.withFallbacks({ fallbacks: [backupWithTools] });
```
Це гарантує, що якщо Primary API впаде під час вирішення, який інструмент викликати, LangGraph автоматично переключиться на Backup API.

### ⚠️ ЗНАЙДЕНО КРИТИЧНИЙ НЕДОЛІК (Найнебезпечніше місце)
У файлі `buildAgentGraph` викликається:
```typescript
const tools = createAgentTools(llmRaw, vectorStore);
```
Ми передаємо `llmRaw` (сиру модель без Fallbacks) всередину інструментів (таких як `summarize.tool` або `compare.tool`). 
**Проблема:** Якщо інструменту для його внутрішньої роботи потрібен LLM (наприклад, щоб зробити саммарі знайденого тексту), він використає `llmRaw`. Якщо в цей момент OpenAI API поверне 503 Timeout, інструмент впаде, і весь граф зупиниться з помилкою. Глобальний Fallback тут не спрацює, бо інструмент має доступ лише до сирої, незахищеної моделі!

---

## 3. Аудит Agentic Routing (Reflection & Self-Correction)

### Цикл Generator → Grader → Retry
Цикл реалізовано ефективно. Нода `grader` оцінює якість відповіді і у разі помилки повертає рядок з фідбеком (`gradingFeedback`) та інкрементує лічильник (`retryCount: 1`).

### Захист від нескінченних циклів (Infinite Loop Prevention)
Захист **імплементований коректно**. В `router/grader.router.ts`:
```typescript
const MAX_RETRIES = 2;
if (state.retryCount >= MAX_RETRIES) {
  return 'pass'; // Force END 
}
```
Це означає, що агент не застрягне у вічному циклі галюцинацій (коли `grader` постійно відхиляє відповідь `generator`-а). Після двох провалів граф примусово вийде і поверне користувачу те, що зміг згенерувати на останній ітерації. Це безпечно для Production.

---

## 4. Action Items для Senior Developer

Суворо дотримуючись `.agent/rules/`, виконай наступне:

### Крок 1. Рефакторинг Agent Tools (DI та Resilience)
Ми вже реалізували `ModelFactory` у Фазі 1. Інструменти більше не повинні конструюватися мануально в графі через функцію `createAgentTools(llmRaw, ...)`, яка приймає сиру модель.
Поточна реалізація порушує NestJS DI та надійність:
1. Перетвори функції `createSummarizeTool`, `createCompareTool` тощо на `@Injectable()` класи (або фабрики провайдерів), які інжектять `PRIMARY_LLM_TOKEN` (бажано обгорнутий у fallback, або `BACKUP_LLM_TOKEN` для легких задач сумаризації).
2. Замість передачі масиву інструментів вручну, інжекти масив готових інструментів безпосередньо у `AgentService` і передавай їх у `buildAgentGraph(..., tools)`.

### Крок 2. Передача безпечних моделей
Якщо Крок 1 надто складний для поточного рефакторингу, найменше, що треба зробити:
Змінити сигнатуру `createAgentTools` так, щоб вона приймала `llmWithFallbacks` (або краще — `fastLlm` для сумаризацій), а не `llmRaw`. Сира модель повинна використовуватись **ВИКЛЮЧНО** для методу `.bindTools()`, але ніколи не передаватись як виконавець всередину функцій чи інструментів.
