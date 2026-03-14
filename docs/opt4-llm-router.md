# Архітектурне Рішення: LLM Routing 2.0 (Intelligent Gateway)

## 1. Аналіз проблеми: Перевитрати на простих запитах
Зараз кожен запит користувача, навіть найпростіший (на кшталт "Привіт", "Якого ти кольору?" чи "Скільки буде 2+2"), проходить через важкий і дорогий RAG-пайплайн і обробляється основною моделлю (`PRIMARY_LLM` — наприклад, gpt-4o або gpt-4o-preview). 
Це призводить до двох проблем:
1. **Висока затримка (Latency):** RAG + важка модель навіть на просте питання відповідають кілька секунд.
2. **Марнотратство (Cost):** Витрачаються дорогі токени на генерацію відповідей, з якими легко впоралася б найдешевша модель типу gpt-4o-mini.

## 2. Дизайн Класифікатора (Classifier Node)
Ми інтегруємо розумний маршрутизатор як найпершу точку входу в наш RAG (LangGraph) — **Classifier Node**. 

- **Відповідальність:** Лише класифікація вхідного запиту.
- **Модель:** Завжди використовує `FAST_LLM` (gpt-4o-mini).
- **Промпт (SystemMessage):**
```text
You are an intelligent routing assistant. Analyze the user query.
If the query is conversational, a simple pleasantry, or a general knowledge question that does NOT require searching our internal documents to answer, classify it as "SIMPLE".
If the query requires context, analysis, or specific knowledge from uploaded documents, classify it as "COMPLEX".
Respond strictly in JSON: { "tier": "SIMPLE" | "COMPLEX" }
```

## 3. Логіка Маршрутизації (Conditional Edges)
В `agent.graph.ts`, після ноди `classifier`, ми налаштовуємо `Conditional Edge`:

### Шлях "Tier 1: Simple"
- Якщо `tier === 'SIMPLE'`, запит перенаправляється на нову ноду `simple_generator`.
- Ця нода використовує `FAST_LLM` (gpt-4o-mini) для негайної генерації відповіді, оминаючи векторний пошук.
- Після генерації стан графа переводиться в `__end__`.
- Затримка: < 1 секунди. Вартість: мінімальна.

### Шлях "Tier 2: Complex"
- Якщо `tier === 'COMPLEX'`, запит йде по нашому класичному маршруту: `planner` -> `search` -> `generator` (використовуючи `PRIMARY_LLM`).

## 4. Механізм Ескалації (Fallback)
Існує ризик, що класифікатор помилково направить складне питання в шлях `SIMPLE`, або `FAST_LLM` в ноді `simple_generator` зрозуміє, що їй бракує контексту.

**Логіка Ескалації:**
- Якщо `simple_generator` повертає відповідь з високою невпевненістю (наприклад, "Я не маю такої інформації"), то застосовується Edge:
  `simple_generator -> if (confidence < threshold or fallback_flag == true) -> planner -> ...` (перенаправлення на складний маршрут).
- Це надійно захистить від "галюцинацій", якщо дешева модель була занадто самовпевненою на попередньому етапі.

## 5. NestJS Інтеграція: Вимоги .agent/rules/
1. **Dependency Injection:** В `LlmModule` ми вже створили `FAST_LLM_TOKEN` та `PRIMARY_LLM_TOKEN` через нашу `ModelFactory`.
2. В `AgentService` під час збірки графа `buildAgentGraph(llmRaw, llmWithFallbacks, vectorStore, checkpointer, fastLlm)`, параметр `fastLlm` має передаватися у нові функції:
   - `createClassifierNode(fastLlm)`
   - `createSimpleGeneratorNode(fastLlm)`
3. **Structured Output:** Класифікатор повинен працювати **виключно** через `fastLlm.withStructuredOutput()` з використанням **zod** схеми `{ tier: z.enum(['SIMPLE', 'COMPLEX']) }`, щоб гарантувати сувору типізацію вихідного результату для Conditional Edge. Жодного парсингу сирого тексту.
