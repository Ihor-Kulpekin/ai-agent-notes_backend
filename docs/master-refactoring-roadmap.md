# Master Refactoring Roadmap

## High-Level Diagnosis
**Проєкт демонструє солідну базу:** архітектура побудована навколо потужного графа LangGraph з підтримкою Time-Travel/Human-in-the-Loop, реалізовано гібридний пошук та ієрархічно розділену пам'ять (STM/LTM). 

**Однак накопичився суттєвий архітектурний технічний борг:**
1. **Порушення Single Responsibility Principle (SRP):** Сервіси (особливо `AgentService` та `ShortTermMemoryService`) перевантажені різнотипною логікою (бізнес-логіка + інфраструктура/мережеві сокети).
2. **Просочування абстракцій (Leaky Abstractions):** Бізнес-логіка знає про транспортний шар (наприклад, `AgentService` прямо викликає `client.join(threadId)` для socket.io).
3. **Громіздка логіка в репозиторіях та фільтрах:** Специфічна бізнес-логіка пошуку та обробки помилок знаходиться там, де їй не місце.

---

## Phased Execution Plan

### Фаза 1: Core / Infrastructure Layer
**Мета:** Очистити конфігурацію, обробку помилок та ін'єкції.
- **`src/filters/all-exceptions.filter.ts`**: Застосувати патерн **Strategy** або **Chain of Responsibility** для обробки помилок (зараз це великий `if-else` блок перевірки тексту повідомлень). Створити окремі типи кастомних ексепшенів (`OpenAIException`, `OpenSearchException`).
- **`src/app.module.ts`**: Об'єднати дрібні системні модулі за допомогою патерну **Facade** (створити єдиний `CoreModule`, який інкапсулює конфіги, логер та фільтри).

### Фаза 2: Memory & Database (RAG) Layer
**Мета:** Відділити інфраструктурні запити від бізнес-логіки обробки та створення пам'яті.
- **`src/repositories/opensearch.repository.ts`**: Винести логіку формування комбінованого гібридного пошуку (kNN + BM25 scores) у відповідний `SearchService`. Репозиторій має відповідати лише за "чисте" виконання запитів. Використати патерн **Builder** для створення OpenSearch запитів.
- **`src/services/memory/short-term.memory.ts`**: Винести логіку виклику LLM для створення summary (`callSummarisationLlm`) у спеціалізований **SummarizationService**. Роль STM має зводитись лише до управління кешем.

### Фаза 3: AI Engine (LangGraph) Layer
**Мета:** Розвантажити монолітний `AgentService` та структурувати роботу з графом.
- **`src/services/agent/agent.service.ts`**: Це "God Object" (понад 440 рядків). Необхідно розбити його за допомогою патерну **Command** або **Use Case**:
  - `AgentRestUseCase` для обробки REST-запитів (`run`, `resume`, `reject`).
  - `AgentStreamUseCase` для WebSocket стрімінгу (`stream`, `streamResume`).
- **State Extractor**: Винести приватні методи (`extractPendingAction`) у допоміжний утилітарний клас `GraphStateInspector`.

### Фаза 4: Transport Layer
**Мета:** Повністю ізолювати бізнес-логіку від деталей транспорту (REST/WS).
- **`src/gateways/chat.gateway.ts` & `src/services/agent/agent.service.ts`**: Прибрати будь-які згадки об'єкта `Socket` в `AgentService`. Виклик `client.join(threadId)` має бути інкапсульований на рівні Gateway, а `AgentService` повинен повертати або емітувати абстрактні події (через `AgentEventEmitter` або патерн **Mediator**), не знаючи про конкретного клієнта чи сокети.
- **`src/api/v1/controllers/chat.controller.ts`**: Для уніфікації обробки REST та WebSocket, впровадити CQRS або єдині Command-об'єкти, які будуть відправлятись в AI Engine.

---

## Critical Risks (Вузькі місця при масштабуванні)

1. **Race Conditions та Горизонтальне Масштабування WebSocket:** Тісна прив'язка `AgentService` до `Socket` (`client.join`) та використання локального `AgentEventEmitter` зламається при запуску кількох інстансів (реплік) бекенду. Необхідно впроваджувати **Redis Pub/Sub** для розподіленого емітування подій (Socket.IO Redis Adapter).
2. **Блокування при Bulk Indexing:** В `opensearch.repository.ts` метод `bulkIndex` використовує `refresh: 'wait_for'`. Під час активного завантаження документів кількома користувачами це може призвести до блокування треду та нестачі з'єднань.
3. **Memory Leaks під час Summarization (STM):** Якщо LLM `callSummarisationLlm` повертає помилку/падає (rate limit), вікно повідомлень `window.slice` не оновлюється, масив продовжує зростати і перевищуватиме ліміти Redis та контекстних вікон LLM. Потрібний жорсткий fallback-обрізувач (FIFO truncation) для `short-term.memory.ts`.
4. **Нескінченні цикли графа:** Хоча є поле `retryCount` в `AgentState`, якщо логіка ноди-рерайтера чи генератора не відпрацьовує коректне збільшення цього лічильника, можливе зациклення між вузлами "Генератор <-> Оцінювач", яке швидко спалить бюджети OpenAI.
