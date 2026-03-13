# Production Hardening Plan: notesQa

> **Автор:** Principal AI Architect  
> **Для:** Senior Backend Developer  
> **Мета:** Детальне ТЗ для впровадження 4 критичних production-ready фіч в існуючу архітектуру NestJS + LangGraph.

---

## 1. Observability (LangSmith Tracing)

Поточна імплементація: `LlmService` додає `LangChainTracer` лише до викликів LLM (`new ChatOpenAI({ callbacks })`). Це логує лише LLM-запити, але не показує граф цілком (топологію, ноди, edges, стан). Для повного трейсингу на рівні графа потрібен інший підхід.

**Завдання:** Налаштувати автоматичний трейсинг всього `graph.stream` та `graph.invoke`.

### Крок 1: Глобальна ініціалізація змінних середовища
Найкращий спосіб інтегрувати LangSmith з LangGraph — це **глобальні змінні середовища**, оскільки рантайм LangGraph автоматично їх підхоплює і трейсить весь потік (від нод до LLM). 

У `src/main.ts` (найперший файл, ще до `NestFactory.create`) або `app.module.ts` (в `ConfigModule`):
Переконайся, що в `.env` є змінні, і процес має до них доступ. Але щоб бути 100% певним, прокинь їх явно при старті додатку:

```typescript
// src/main.ts
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  if (configService.get('langsmith.apiKey')) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = configService.get('langsmith.apiKey');
    process.env.LANGCHAIN_PROJECT = configService.get('langsmith.project');
    process.env.LANGCHAIN_ENDPOINT = 'https://api.smith.langchain.com';
  }
  // ...
}
```

### Крок 2: Очищення LlmService
Тепер ти можеш **видалити** `buildCallbacks()` та ручну передачу `callbacks` у `new ChatOpenAI({...})` всередині `LlmService`. Завдяки `LANGCHAIN_TRACING_V2=true`, LangChain сам підхопить Tracer глобально.

### Крок 3: Передача Thread ID у LangSmith (Опціонально, але рекомендовано)
Щоб у LangSmith записи групувалися по тредах (користувацьких сесіях), у `AgentService.stream()` додай `metadata`:

```typescript
// agent.service.ts під час виклику stream:
const streamIter = await this.graph.stream(
  initialState, 
  { 
    configurable: { thread_id: threadId },
    metadata: { thread_id: threadId, user_id: userId } // ← Додасться в LangSmith
  }
);
```

---

## 2. LLM Resilience (Provider Fallback)

LangChain має вбудований метод `.withFallbacks()` для забезпечення надійності при падінні 5xx або 429 (Rate Limit).

**Завдання:** Створити fallback-ланцюжок у `LlmService`.

### Крок 1: Налаштування резервної моделі
У `LlmService` створюємо інстанс резервної моделі (наприклад, інший регіон OpenAI, інша модель, або Claude via AWS Bedrock).

```typescript
// src/services/llm/LlmService.ts
import { RunnableWithFallbacks } from '@langchain/core/runnables';

export class LlmService {
  private primaryModelWithFallback: RunnableWithFallbacks<any, any>;

  constructor(private readonly configService: ConfigService) {
    const primary = new ChatOpenAI({
      modelName: 'gpt-4o',
      maxRetries: 1, // Зменшуємо ретраї основної, щоб швидше перейти на fallback
      timeout: 10000, 
    });

    const backup = new ChatOpenAI({
      modelName: 'gpt-4o-mini', // або 'gpt-3.5-turbo' / ChatBedrock
      maxRetries: 2,
    });

    // Огортаємо основну модель у fallback
    this.primaryModelWithFallback = primary.withFallbacks({
      fallbacks: [backup],
      // Можна додати exceptionsFilter, щоб фолбечити тільки на 5xx / 429
    });
  }

  getModel() {
    return this.primaryModelWithFallback;
  }
}
```

Усі ноди графа, які викликають `llm.invoke()`, автоматично почнуть використовувати fallback патерн у разі збою, **без зміни коду самих нод**.

---

## 3. Agentic RAG (Query Rewriter Node)

Користувач часто пише запити типу: "А що там написано про це?". Векторна БД (OpenSearch) нічого не знайде по слову "це". Нам потрібна нода, яка перетворить контекст пам'яті + поточне питання у **самодостатній пошуковий запит**.

**Завдання:** Впровадити ноду `query_rewriter`.

### Крок 1: Зміна State
Додаємо нове поле у стан графа для зберігання переписаного запиту.
```typescript
// agent.state.ts
export const AgentState = Annotation.Root({
  // ...
  searchQuery: Annotation<string>({ // ← НОВЕ ПОЛЕ
    reducer: (_, update) => update,
    default: () => '',
  }),
  // ...
});
```

### Крок 2: Створення Query Rewriter Node
```typescript
// src/services/agent/nodes/query-rewriter.node.ts
export function createQueryRewriterNode(llm: ChatOpenAI) {
  return async (state: AgentStateType) => {
    // Якщо історія повідомлень порожня, переписувати майже нічого (але можна залишити як є)
    const prompt = `You are a search query rewriting expert.
Rewrite the latest user question into a standalone, optimized search query for a vector database.
Use the conversation history (messages) to resolve any prorouns references (e.g., "it", "this").
ONLY output the rewritten query, nothing else.`;

    const response = await llm.invoke([
       new SystemMessage(prompt),
       ...state.messages // Історія для контексту
    ]);

    return { 
      searchQuery: response.content as string,
      steps: [`QUERY_REWRITER: optimized query → "${response.content}"`]
    };
  };
}
```

### Крок 3: Оновлення Search Node
У `search.node.ts` зміни `state.question` на `state.searchQuery || state.question`.
```typescript
// node/search.node.ts
const query = state.searchQuery || state.question;
const documents = await vectorStore.similaritySearch(query, 4);
```

### Крок 4: Оновлення топології графа
Модифікація `agent.graph.ts`:
```typescript
// Додаємо ноду:
.addNode('query_rewriter', createQueryRewriterNode(classifierLlm)) // fast model suits here

// Змінюємо Conditional Edge від Planner'а:
.addConditionalEdges('planner', routeAfterPlan, {
  search: 'query_rewriter', // замість 'search'
  // ...
})

// Додаємо Static Edge:
.addEdge('query_rewriter', 'search') // query_rewriter завжди йде в search
```

---

## 4. OpenSearch Hybrid Search (kNN + BM25)

Чистий векторний пошук (kNN) погано працює для точних збігів (наприклад ID документів, специфічні абревіатури). Гібридний пошук комбінує семантику (вектори) та лексику (BM25).

**Завдання:** Створити pipeline гібридного пошуку у `VectorStoreService`.

### Крок 1: Налаштування індексу (Settings/Mappings)
Під час розгортання/ініціалізації OpenSearch (скрипт ств. індексу), поле `content` повинно мати тип `text` (для BM25) та `vector` (для kNN). Це у нас уже майже є, але переконайся:
```json
"mappings": {
  "properties": {
    "content": { "type": "text", "analyzer": "standard" },
    "embedding": { "type": "knn_vector", "dimension": 1536 }
  }
}
```

### Крок 2: Модифікація OpenSearch Repository
У `opensearch.repository.ts` створи новий метод `hybridSearch`:

```typescript
// src/repositories/opensearch.repository.ts
async hybridSearch<T>(
  queryText: string,
  vector: number[],
  k: number,
  index = INDEX_NAME
): Promise<T[]> {
  const body = {
    size: k,
    query: {
      hybrid: { // Вимагає OpenSearch neural-search плагіну
        queries: [
          { match: { content: queryText } },
          { knn: { embedding: { vector, k } } }
        ]
      }
    },
    // В OpenSearch 2.10+ є search_pipeline для нормалізації скорів (RRF)
    // Якщо search_pipeline не налаштовано, використовуємо класичний bool should:
  };

  // Фолбек варіант, якщо hybrid queries plugin не активовано (більш надійно):
  const fallbackBody = {
    size: k,
    query: {
      bool: {
        should: [
          { match: { content: { query: queryText, boost: 1.0 } } },
          { knn: { embedding: { vector, k, boost: 1.0 } } } // Налаштувати ваги (BM25 vs kNN)
        ]
      }
    }
  };

  const response = await this.client.search({ index, body: fallbackBody });
  return response.body.hits.hits;
}
```

### Крок 3: Інтеграція у VectorStoreService
```typescript
// src/services/vector-store/vector-store.service.ts
public async similaritySearch(
  query: string,
  k: number = 4,
  index = INDEX_NAME,
): Promise<Document[]> {
  const queryVector = await this.embeddedService.embedQuery(query);
  
  // Викликаємо новий hybrid метод:
  const hits = await this.repository.hybridSearch<IOpenSearchHit>(
    query, 
    queryVector, 
    k, 
    index
  );

  return hits.map(/* mapping to Document */);
}
```

### Резюме для розробника:
1. Зроби ці зміни покроково.
2. Для LangSmith перевір чи підтягуються credentials.
3. Query Rewriter значно покращить RAG (покриє follow-up питання).
4. Hybrid Search збільшить точність пошуку за артикулами чи назвами. 
5. Обов'язково прожени `npm run test` та manual QA (ws з'єднання з клієнтом) після змін у графі.
