# OpenSearch Deep Dive: Vector Database Architecture

Це критичний розділ для розуміння нашої Retrieval-Augmented Generation (RAG) архітектури. Ми розберемо, як наша платформа notesQa використовує OpenSearch для роботи з довгостроковою пам'яттю (LTM).

## 1. Ази OpenSearch (Фундамент)

OpenSearch — це розгалуження (fork) Elasticsearch, потужний рушій пошуку та аналітики на базі Apache Lucene. 
Ми обрали його замість спеціалізованих векторних баз (як Pinecone, Weaviate чи Milvus) з кількох стратегічних причин:
- **Багатовимірність даних:** Окрім векторів, ми оперуємо складними типами даних, багатоструктурними метаданими, для яких потрібні потужні агрегації (як наш `aggregateBySource` у репозиторії).
- **Hybrid Search Engine:** OpenSearch дозволяє тримати *Inverted Index* (інвертований індекс для блискавичного лексичного пошуку за словами) та *Vector Index* (для ембеддінгів) "під одним дахом".

## 2. Векторний пошук: kNN (K-Nearest Neighbors) Deep Dive

Наш `EmbeddedService` створює Dense Vectors (щільні вектори). Наприклад, модель `text-embedding-3-small` генерує масив з 1536 чисел (float32). Кожен такий вектор представляє семантичний "зміст" тексту в 1536-вимірному просторі.

### Алгоритм HNSW (Hierarchical Navigable Small World)
Шукати найближчих сусідів "в лоб" (Exact kNN, тобто порівнювати вектор питання з УСІМА мільйонами векторів у базі через Cosine Similarity) — неможливо повільно (O(N)). 
OpenSearch kNN використовує плагін, який будує граф за алгоритмом **HNSW**. HNSW створює багаторівневий граф (як метро: від експрес-зупинок до локальних). Пошук іде через ці рівні, наближаючись до цілі з логарифмічною складністю. Це працює миттєво, але є "Approximate" (наближеним) і вимагає постійного тримання графу в оперативній пам'яті (RAM).

### В нашому коді (`OpenSearchRepository.ts`):
Звичайний kNN пошук реалізовано методом:
```typescript
async knnSearchWithFilter<T>(...): Promise<T[]> {
  const query = {
    knn: {
      embedding: {
        vector, // 1536-вимірний масив
        k,      // скільки найближчих сусідів повернути
      },
    },
  };
  // ... далі обгортка в bool query для фільтрів
}
```

## 3. Hybrid Search: Святий Грааль RAG

### Теорія: Проблема чистого kNN
Чистий kNN вимірює *семантичну* схожість. Але він жахливо працює, коли користувачеві потрібне точне входження специфічних термінів.
*Приклад:* Запит "Помилка X-49T". Векторний пошук знайде тексти про загальні "помилки", оскільки семантично це схоже. Але він упустить документ, де є точний рядок "X-49T".

Тут на допомогу приходить **BM25** (Best Matching 25) — лексичний алгоритм пошуку (Sparse Vectors) на базі TF-IDF, який ідеально шукає ключові слова.

### Аналіз нашого коду (`VectorStoreService.ts` + `OpenSearchRepository.ts`)
У нашому сервісі реалізовано виклик `hybridSearch`. Якщо ми зазирнемо в репозиторій, ми побачимо гібридний DSL запит:

```typescript
const fallbackBody = {
  size: k,
  query: {
    bool: {
      should: [ // OR логіка: шукаємо І текст, І вектор
        {
          match: { // BM25 (Повнотекстовий пошук)
            content: {
              query: queryText,
              boost: 1.0,
            },
          },
        },
        {
          knn: { // Семантичний пошук
            embedding: {
              vector: queryVector,
              k,
              boost: 2.0, // Семантика важливіша, але не абсолютна (! Linear Weighting)
            },
          },
        },
      ],
    },
  },
};
```

**Нормалізація та Скоринг (Алгоритм об'єднання)**
BM25 і kNN мають різні шкали score. Cosine Similarity kNN коливається від 0 до 1, у той час як BM25 може видавати незв'язні значення (наприклад, 15.0). Просто додати їх (як робить `should` блок) математично неправильно, оскільки BM25 "проковтне" kNN score.

У нас **частково** використано механізм *Linear Combination (alpha-weighting)* через параметри `boost`. Ми "бустуємо" kNN (2.0) проти BM25 (1.0).
*Зауваження архітектора:* Це "бідна" нормалізація. Для Enterprise рішень OpenSearch надає функцію **Normalization Processor** (який стискує BM25 у межі [0,1]) та **RRF (Reciprocal Rank Fusion)**, який об'єднує результати не за абсолютним score, а за їхньою "позицією в рейтингу" (ранком).

## 4. Життєвий цикл запиту в нашому коді

1. Вузол графа `search` або `relevance_check` викликає `VectorStoreService.similaritySearch(query)`.
2. `VectorStoreService` викликає `embeddedService.embedQuery(query)`, відправляючи стрінгу до OpenAI Embdedding API, повертаючи масив `vector[1536]`.
3. `VectorStoreService` передає пару `(query, vector)` до `repository.hybridSearch`.
4. `OpenSearchRepository` формує JSON DSL (фрагмент якого наведено вище) і через Node.js Client відправляє POST запит на `/index_name/_search`.
5. Отриманий масив `hits.hits` мапиться на об'єкти LangChain `Document`, куди ми складаємо: `pageContent` (з `hit._source.content`) та `metadata` (з `hit._source.metadata` разом зі `hit._score`).

## 5. Production Considerations

1. **Mapping:** При створенні індексу (`createIndexIfNotExists`) надважливо правильно оголосити поле вектора. Тип має бути `knn_vector`, `dimension` = 1536 (відповідно до моделі OpenAI), а `method` має бути вказано як `hnsw` з відповідною метрикою простору (`cosinesimil` або `l2`).
2. **Пам'ять (RAM):** Алгоритм HNSW формує величезний граф. На production індексах (мільйони документів), вектори **повинні** триматись у RAM для забезпечення швидкості (зазвичай це половина всієї оперативної пам'яті сервера, виділена під JVM Heap від OpenSearch).
3. **Wait_for vs Refresh:** У логіці `bulkIndex` нашого репозиторію є розумне рішення `refresh: 'wait_for'`. Замість того щоб блокувати сервіс примусовим Refresh (що дуже затратно для векторних індексів), або ризикувати "осиротілими" даними, ми не перевантажуємо I/O дисків, чекаючи природнього refresh cycle.
