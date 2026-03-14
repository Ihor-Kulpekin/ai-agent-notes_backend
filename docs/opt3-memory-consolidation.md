# Архітектурне Рішення: Memory Consolidation (Episodic vs Semantic)

## 1. Аналіз проблеми: Переповнення довгострокової пам'яті
Наразі ми зберігаємо історію чату у двох місцях:
1. **Short-Term Memory (Redis):** Вікно останніх повідомлень. З часом воно сумаризується.
2. **Long-Term Memory (OpenSearch):** Кожен "turn" (репліка користувача та асистента) зберігається як окремий документ (`content`, `embedding`, `timestamp`, `userId`).

Цей другий тип пам'яті називається **Episodic Memory** (Епізодична пам'ять). Проблема в тому, що з часом вона розростається до тисяч дрібних, малоінформативних чанків ("Привіт", "Зроби це", "Окей"). При семантичному пошуку під час RAG ці дрібні епізоди починають "засмічувати" векторний контекст, розбавляючи дійсно важливі факти.

Нам потрібна **Semantic Memory** (Семантична пам'ять) — узагальнені факти ("Юзер працює з NestJS", "Юзер просив завжди використовувати українську мову"), які з часом витягуються зі старих епізодів у фоновому режимі.

## 2. Моделі Даних (Data Models)

### EpisodicMemoryEntry (сирі логи)
*(Цей індекс вже існує з Фази 2)*
```typescript
interface IEpisodicMemoryEntry {
  id: string;
  userId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  embedding: number[];
  timestamp: number;
}
```

### SemanticMemoryEntry (узагальнені факти)
Потрібно створити новий мапінг в `indexes-creating.constants.ts` для індексу `semantic_memory`:
```typescript
interface ISemanticMemoryEntry {
  id: string; // UUID
  userId: string;
  fact: string; // Узагальнений факт (напр. "Користувач віддає перевагу функціональному програмуванню")
  confidence_score: number; // Наскільки LLM впевнена у факті (1-10)
  source_episodes: string[]; // Масив ID з EpisodicMemory, на яких базується факт
  embedding: number[]; // Вектор для факту (для k-NN пошуку)
  created_at: number;
}
```

## 3. MemoryConsolidationService

Створити новий сервіс `MemoryConsolidationService` (можливо, в модулі `MemoryModule`), головна мета якого — фоновий аналіз і конвертація епізодів у семантичні факти.

### Cron-задача (Пайплайн консолідації)
Додати декоратор `@Cron('0 3 * * *')` (запуск щодня о 3:00 ночі, коли навантаження мінімальне).

**Алгоритм роботи:**
1. **Вибірка (Retrieval):** Отримати з OpenSearch (індекс епізодичної пам'яті) всі записи, `timestamp` яких старіший за `X` днів (наприклад, 7 днів: `Date.now() - 7 * 24 * 60 * 60 * 1000`). Групувати їх по `userId`.
2. **Екстракція (Extraction):** Для кожного `userId`, зібрати всі його старі епізоди в один текстовий блок. Відправити цей блок в LLM (бажано `FAST_LLM` — gpt-4o-mini, бо задача проста).
   - *Промпт для LLM:* `Extract core facts, preferences, and long-term context about the user from the following conversation logs. Ignore pleasantries and transient details. Return a JSON array of objects: [{ "fact": string, "confidence_score": number }]`.
3. **Збереження (Consolidation):** Згенерувати `embedding` для кожного нового факту і зберегти його в новий OpenSearch індекс (`semantic_memory`) у форматі `ISemanticMemoryEntry`.
4. **Архівування (Cleanup):** Видалити оброблені епізодичні записи з OpenSearch (`deleteByQuery` де `timestamp < threshold`), щоб вони більше не засмічували звичайний векторний пошук. (Пізніше можна додати архівування в S3 замість видалення, але для початку — DELETE).

## 4. NestJS Інтеграція та Правила коду (.agent/rules/)
1. **Модулі:** Встановити `@nestjs/schedule`. Підключити `ScheduleModule.forRoot()` у `AppModule`.
2. **DI:** Інжектити `ConfigService`, `LlmService`, `EmbeddedService` та `ISearchRepository` в `MemoryConsolidationService`.
3. **Typing:** Жодного `any`. Промпт в LLM має закликати до генерації `JSON`, але парсинг та валідація має здійснюватись через **Zod**. Використовувати `DynamicStructuredTool` або `llm.withStructuredOutput()` від LangChain для надійної екстракції JSON-масивів.
4. **Контекст:** В `MemoryOrchestratorService` (при побудові системного промпту) додай паралельний `knnSearch` по індексу `semantic_memory`. Промпт агента повинен містити секцію:
   `User Core Facts: \n - <fact1>\n - <fact2>` (вибрані за вектором питання).
