# Phase 2: Memory & Database (RAG Layer) - Architectural Audit

## 1. Аудит OpenSearch та Векторного пошуку

### Гібридний пошук (kNN + BM25)
В `OpenSearchRepository.hybridSearch` реалізовано лінійну комбінацію скорів за допомогою `bool.should`.
**Проблема:** Оцінки (scores) від BM25 та HNSW kNN мають абсолютно різні шкали (BM25 може повертати скор 15.0+, а cosine similarity - від 0 до 1). Просте додавання через `boost` (`2.0` для kNN та `1.0` для text) є неточним і може призводити до того, що повнотекстовий пошук завжди буде перебивати семантичний.
**Рекомендація:** Необхідно імплементувати нормалізацію або алгоритм **Reciprocal Rank Fusion (RRF)** для об'єднання результатів з двох різних запитів.

### kNN з фільтрами (Post-filtering vs Pre-filtering)
У методі `knnSearchWithFilter` фільтр застосовується ззовні `knn` запиту:
```json
{ "bool": { "must": [{ "knn": ... }], "filter": [...] } }
```
**Проблема (Найслабше місце):** Це так званий **Post-filtering**. OpenSearch спочатку знайде `k` найближчих векторів, а потім відфільтрує їх. Якщо фільтр суворий, ви можете отримати 0 результатів, навіть якщо в базі є релевантні документи, що відповідають фільтру.
**Рекомендація:** Змінити запит на **Efficient k-NN filtering** (Pre-filtering), помістивши фільтр безпосередньо всередину об'єкта `knn` (підтримується в OpenSearch 2.4+).

### Index Mapping
Мапінг в `indexCreationDocument` налаштовано коректно: використовується `type: 'knn_vector'`, `dimension: VECTOR_DIMENSION`, `method: { name: 'hnsw', space_type: 'cosinesimil', engine: 'lucene' }`. Це оптимальний вибір для OpenSearch.

---

## 2. Аудит Архітектури Пам'яті (NestJS + LangGraph)

### Розділення шарів
Шари розділені добре. `VectorStoreService` оперує доменними сутностями (LangChain `Document`), тоді як `OpenSearchRepository` оперує інфраструктурними типами (`Search_RequestBody`). У контролерах не знайдено прямого доступу до репозиторію.
Але є нюанс: `VectorStoreService` самостійно викликає `EmbeddedService` для отримання векторів. З точки зору SRP (Single Responsibility Principle), `VectorStoreService` бере на себе і векторизацію (обчислення), і збереження (I/O). Однак для RAG-додатків це припустимий фасад.

### Token Window / STM
`ShortTermMemoryService` має гарний механізм `summarise`. Коли кількість токенів перевищує `threshold` (наприклад, 80% від 3000 = 2400 токенів), запускається фонова сумаризація половини старих повідомлень.
**Проблема:** Механізм працює *після* додавання повідомлення і є асинхронним (fire-and-forget у деякому сенсі для наступних кроків). Немає жорсткого захисту (Hard Cap) безпосередньо у методі `getActiveWindow()`. Якщо сумаризація впаде з помилкою, вікно продовжить рости і врешті викличе помилку `max_tokens` вже на рівні API OpenAI.

### BaseCheckpointSaver (Історія стейту)
Реалізовано через `@langchain/langgraph-checkpoint-redis` з використанням `RedisSaver`. Провайдер `CHECKPOINTER` зареєстровано у `CheckpointerModule`. Це ефективне, готове для продакшену рішення, що дозволяє Thread Persistence та відновлення. 

---

## 3. Action Items для Senior Developer

Суворо дотримуючись `.agent/rules/`, виконай наступні кроки:

### Крок 1. Виправлення Efficient k-NN Filtering
В `OpenSearchRepository.knnSearchWithFilter` зміни структуру запиту. Замість:
```json
{
  "bool": {
    "must": [ { "knn": { "embedding": { "vector": vector, "k": k } } } ],
    "filter": filters
  }
}
```
Зроби так (документація OpenSearch: k-NN with filter):
```json
{
  "knn": {
    "embedding": {
      "vector": vector,
      "k": k,
      "filter": { "bool": { "must": filters } }
    }
  }
}
```

### Крок 2. RRF для Hybrid Search (Нормалізація)
В `OpenSearchRepository.hybridSearch` необхідно відмовитися від простого `bool.should`. 
Оскільки RRF потребує OpenSearch Search Pipelines (які можуть бути не налаштовані), реалізуй ручний RRF на рівні NodeJS:
1. Виконай 2 ОЗКРЕМИХ запити (через `msearch` або Promise.all): один `match`, один `knn`.
2. Об'єднай результати в коді за формулою RRF: `score = 1 / (k + rank)` для кожного документа в обох списках (де стандартне `k=60`).
3. Відсортуй за новим `score` і поверни топ-K.

### Крок 3. Надійність ShortTermMemoryService
Додай захисний механізм *Hard Limit* у `ShortTermMemoryService`. 
Якщо `getWindowTokenCount(window)` перевищує абсолютний максимум (`maxWindowTokens`), метод `getActiveWindow()` повинен примусово відрізати старі повідомлення (Shift array) ще до повернення результату, гарантуючи, що ми ніколи не відправимо в LLM більше токенів, ніж дозволено.
