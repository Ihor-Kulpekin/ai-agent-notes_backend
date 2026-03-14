# Phase 3 Changelog: AI Engine (LangGraph Layer)

## 1. Стейт та Модульність Графа
- Файл збірки графа `agent.graph.ts` залишився лаконічним, оскільки архітектура **вже** відповідала вимогам модульності.
- Формування нод (`planner`, `generator`, `grader`, `tools_caller`) вже винесено в ізольовані функції `create...Node()` в директорії `src/services/agent/nodes/`, що дозволяє ізольоване тестування.
- Правила `AgentState` з редьюсерами об'єктів повністю збережені і забезпечують консистентну типізацію.

## 2. Захист від нескінченних циклів (Infinite Loop Prevention)
- Захист **вже був ефективно реалізований**, додаткових змін у логіці виходу не потребував.
- В `AgentState` коректно працює редьюсер поля `retryCount: (current, update) => current + update`.
- У `router/grader.router.ts` логіка діє як безвідмовний запобіжник:
  ```typescript
  export function routeAfterGrading(state: AgentStateType): 'pass' | 'retry' {
    const MAX_RETRIES = 2;
    if (state.retryCount >= MAX_RETRIES) {
      return 'pass'; // Виходимо навіть якщо grader незадоволений
    }
    // ... логіка retry ...
  }
  ```

## 3. Відмовостійкість (Fallbacks & Tools Resilience)
- **Змінені файли:** `agent.tools.ts`, `summarize.tool.ts`, `compare.tool.ts`, `agent.graph.ts`.
- **Проблема, яка була усунута:** Раніше інструменти ініціалізувались сирою моделлю `llmRaw`, через що можливі падіння API OpenAI всередині інструменту (наприклад, при сумаризації тексту) крашили б весь граф.
- **Рішення:** 
  1. Змінено типізацію інструментів: `createSummarizeTool` та `createCompareTool` тепер приймають інтерфейс `BaseChatModel` від LangChain замість конкретного `ChatOpenAI`.
  2. В `agent.graph.ts` інструменти тепер отримують **захищені моделі**:
     - `fastLlm` (Fallback protected) передається в `summarize.tool.ts` для оптимізації швидкості та витрат (оскільки сумаризація — легка задача).
     - `llmWithFallbacks` (Primary with Fallbacks) передається в `compare.tool.ts` для задач, що вимагають кращого аналізу контексту (gpt-4o з фолбеком).
  3. Сира модель `llmRaw` використовується ВИКЛЮЧНО для виклику `.bindTools()` перед обгорткою у `.withFallbacks()`.

## 4. Перевірка типів
- Код успішно пройшов статичну типізацію без жодного впровадження `any`. Використання поліморфного `BaseChatModel` гарантує ідеальну сумісність інструментів як із сирими `ChatOpenAI` інстансами, так і із захищеними `RunnableWithFallbacks`.
- Пряма інстанціація `new ChatOpenAI()` всередині шару AI Engine відсутня, DI дотримано.
