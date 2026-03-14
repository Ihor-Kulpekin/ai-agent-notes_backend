# Архітектурне Рішення: Active Prompting (Dynamic Few-Shot)

## 1. Аналіз проблеми: Статичні приклади (Static Few-Shot)
Наразі багато системних промптів (System Prompts) використовують жорстко зашиті приклади (few-shot learning), щоб навчити модель, як саме відповідати. 
Проблема в тому, що:
- **Cost (Витрати):** Відправка 3-5 статичних прикладів при *кожному* запиті спалює багато токенів.
- **Quality (Якість):** Статичні приклади можуть бути не релевантними до того, що зараз запитує користувач. Наприклад, якщо користувач просить "порівняй два файли", а в промпті зашиті приклади "сумаризуй файл", ці приклади не тільки не допомагають, а інколи й заважають моделі сфокусуватись на правильному форматі відповіді.

## 2. Алгоритм Active Prompting
Ідея полягає в тому, щоб динамічно підбирати лише ті приклади, які найбільш схожі на поточне питання користувача. Це забезпечує набагато вищу якість і дозволяє скоротити промпт (замість 5 універсальних прикладів ми відправляємо 1-2 специфічних).

### 2.1 Дизайн Індексу (OpenSearch)
Ми створимо окремий індекс для зберігання пар "питання-ідеальна відповідь".
- **Назва індексу:** `prompt_examples`
- **Mapping:**
  - `embedding` (type: `knn_vector`, dimension: `1536` для `text-embedding-3-small`, method: `hnsw`).
  - `query` (type: `text`): Текст запиту/ситуації, який ми будемо порівнювати (векторизувати).
  - `expected_output` (type: `text`): Еталонна відповідь агента, яку LLM має брати за приклад.
  - `metadata` (type: `object`): Категорія або теги прикладу (напр., `category: 'comparison'`).

### 2.2 Сервіс ActivePromptingService
Створити новий сервіс у NestJS — `ActivePromptingService` (наприклад, у `src/services/prompts/active-prompting.service.ts`).

**Обов'язки сервісу:**
- `@Inject('ISearchRepository')` для пошуку по OpenSearch.
- Інжект `EmbeddedService` для перетворення вхідного питання (User Query) на вектор.
- Метод `getDynamicExamples(userQuery: string, k: number = 3): Promise<string>`:
  1. Отримує вектор для `userQuery`.
  2. Робить `knnSearch` по індексу `prompt_examples`.
  3. Форматує результати у блок тексту. Наприклад:
     ```text
     Here are some examples of how to answer similar questions:
     
     Example 1:
     User: <query1>
     Assistant: <expected_output1>
     
     Example 2...
     ```

### 2.3 Інтеграція в LangGraph
Динамічні приклади мають підставлятися в процес формування повідомлень для LLM. 
В нашій архітектурі це відбувається у вузлі **`generator`** (файл `src/services/agent/nodes/generator.node.ts`).

1. Отримати відформатований блок прикладів через `ActivePromptingService.getDynamicExamples(state.question)`.
   *(Примітка: для дотримання чистоти архітектури, `ActivePromptingService` може бути викликаний ще в `AgentService`, і результати можуть передаватися через конфіг або вплітатися на етапі ініціалізації графа, але оскільки це генератор — краще інжектити `ActivePromptingService` у функцію `createGeneratorNode(llm, activePromptingService)`).*
2. Вставити цей блок в кінець `SystemMessage` або відразу після системних інструкцій.

### 2.4 Правила коду (.agent/rules/)
- **DI:** Не робити прямих ініціалізацій (ніяких `new OpenSearchClient`). Використовувати існуючий `ISearchRepository`.
- **Typing:** Створити інтерфейс `IPromptExampleHit` для результатів пошуку OpenSearch. Ніякого `any`.
- **KISS/DRY:** Використовуй вже існуючі методи k-NN у `ISearchRepository`.
