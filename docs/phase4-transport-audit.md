# Phase 4: Transport Layer - Architectural Audit

## 1. Аудит WebSockets та Event-Driven Architecture

### Патерн Mediator та Circular Dependency
Реалізація зв'язку між `AgentService` та `ChatGateway` через `AgentEventEmitter` виконана **бездоганно**. Це хрестоматійний приклад вирішення проблеми Circular Dependency (циклічної залежності).
- `ChatGateway` реєструє інстанс `socket.io Server` в `AgentEventEmitter` після ініціалізації (`afterInit`).
- `AgentService` інжектить лише `AgentEventEmitter` (причому через `@Optional()`, що робить модуль незалежним від WebSockets) і емітує події без жодного знання про Gateway.

### Стрімінг (Streaming)
Події стрімінгу реалізовані через обхід `AsyncIterable` за допомогою `for await (const chunk of streamIter)`, який повертає `graph.stream(...)` в `AgentService`. Оскільки використовується `await`, це не блокує Node.js Event Loop. Архітектура кімнат (`client.join(threadId)`) забезпечує правильну ізоляцію потоків між клієнтами.

---

## 2. Аудит REST API та Human-in-the-Loop (HITL)

### Clean Architecture в Контролерах
Контролер `ChatController` повністю відповідає принципам Clean Architecture. Він не містить жодної бізнес-логіки. Його зона відповідальності суворо обмежена прийомом HTTP-запитів, передачею їх у `ChatService` та поверненням відповідей.

### Резюме графа (HITL)
Ендпоінт `POST /chat/resume` коректно отримує `threadId` з DTO та передає потрібні команди (`Command({ resume: ... })`) назад у LangGraph через `ChatService`. Логіка переходу до безпечного `direct` режиму при `action = 'reject'` реалізована грамотно: `new Command({ resume: rejectValue, update: { plan: 'direct' } })`.

---

## 3. Аудит DTO та Валідації

### Zod Validation
Використання Zod-схем (`chatRequestSchema`, `resumeRequestSchema`) у зв'язці з кастомним `ZodValidationPipe` забезпечує жорстку runtime-валідацію вхідних даних (Body, Params). Це набагато безпечніше, ніж `class-validator`, коли йдеться про складні типи.

### ⚠️ ЗНАЙДЕНО КРИТИЧНУ ВРАЗЛИВІСТЬ (API Documentation / Swagger)
Повна відсутність Swagger-декораторів.
- В `ChatController` немає жодних декораторів `@ApiTags`, `@ApiOperation`, `@ApiResponse`.
- У файлі `dto/chat.dto.ts` класи типу `ChatResponseDto`, `ChatPendingActionDto` не містять декораторів `@ApiProperty()`.

Оскільки Zod напряму не генерує Swagger-схему (без сторонніх бібліотек типу `nestjs-zod`), API-документація проєкту зараз є абсолютно сліпою. Frontend-розробники не зможуть автоматично згенерувати клієнта або зрозуміти контракти відповідей.

---

## 4. Action Items для Senior Developer

Суворо дотримуючись `.agent/rules/`, виконай наступне:

### Крок 1. Додавання Swagger-декораторів до DTO
Встанови та/або використай декоратори `@nestjs/swagger`. 
Оскільки вхідні DTO (`ChatRequestDto`) генеруються з Zod-схем (`z.infer`), для Swagger потрібно або описати окремі класи з `@ApiProperty()`, або перевести проєкт на `nestjs-zod` (якщо це дозволено архітектурою). Якщо ні — створи класи з `@ApiProperty` для вхідних даних, а Zod залиш лише для Pipe-валідації.
Обов'язково додай `@ApiProperty()` до всіх існуючих вихідних класів (`ChatResponseDto`, `ChatSourceDto`, `ChatPendingActionDto`).

### Крок 2. Документування Контролерів
У `ChatController` та `DocumentController` додай відповідні декоратори:
- Обгорни контролер у `@ApiTags('Chat')`.
- Для кожного методу додай `@ApiOperation({ summary: '...' })`.
- Вкажи можливі відповіді за допомогою `@ApiResponse({ status: 200, type: ChatResponseDto })` та опиши помилки `@ApiResponse({ status: 400, description: 'Validation error' })`.

### Крок 3. Документація WebSockets
Хоча WebSockets напряму не документуються через Swagger NestJS, переконайся, що контракт подій (як `chat:message`, `agent:step`) чітко задокументований хоча б у вигляді JSDoc або окремого Markdown-файлу для клієнтів `docs/websocket-api.md` (якщо його ще немає).
