# Phase 1: Code Review & LLM Model Factory Roadmap

## 1. Аудит принципів KISS та DRY (Exception Handling)

### KISS (Keep It Simple, Stupid)
Поточна реалізація Патерну **Strategy** з 4+ окремими файлами (`HttpExceptionHandler`, `OpenAiExceptionHandler` тощо) для обробки помилок є **класичним прикладом Overengineering**. 
Замість простого mapping-у чи ланцюжка обов'язків (Chain of Responsibility) з простими функціями, ми створили важку об'єктно-орієнтовану ієрархію. Це невиправдано ускладнює навігацію та підтримку, адже вся бізнес-цінність цих класів зводиться до відображення певного рядка `message` чи типу помилки на HTTP-статус.

### DRY (Don't Repeat Yourself)
У стратегіях для `OpenAI` та `OpenSearch` є явне дублювання підходу:
1. Перевірка `exception instanceof SpecificException`.
2. Перевірка `exception instanceof Error` і парсинг `.message.toLowerCase().includes(...)`.

**Рішення:** Замість 4 розрізнених класів доречніше використати єдиний сервіс `ExceptionMapper` або базовий абстрактний клас `BaseExceptionHandler`, куди винести логіку `match` за підрядком або інстансом, щоб інші класи лише передавали словник { ключове_слово: HTTP_STATUS }.

---

## 2. Аудит створення LLM-моделей (The ModelFactory Issue)

### Виявлені проблеми
Фізичний пошук по кодовій базі показав, що інстанси створюються директивно через `new`:
- `src/services/llm/LlmService.ts:32` — `new ChatOpenAI(...)` (primary)
- `src/services/llm/LlmService.ts:41` — `new ChatOpenAI(...)` (backup)
- `src/services/llm/LlmService.ts:60` — `new ChatOpenAI(...)` (fast)
- `src/services/embedded/embedded.service.ts:10` — `new OpenAIEmbeddings(...)`

### Чому це порушує NestJS DI та SOLID?
1. **Порушення Dependency Inversion (D in SOLID):** `LlmService` безпосередньо залежить від конкретної реалізації `ChatOpenAI` з бібліотеки LangChain, а не від абстракції. 
2. **Порушення Single Responsibility (S in SOLID):** Сервіс тепер займається і *конструюванням* (читання конфігів, ініціалізація інстансів), і *використанням* LLM.
3. **Неможливість Unit-тестування:** Оскільки `ChatOpenAI` жорстко захардкоджений (створюється всередині конструктора або методів), його майже неможливо нормально замокати в Jest-тестах.

### Архітектурне рішення: LlmModelFactory

Для вирішення проблеми необхідно використати патерн **Factory Method** у поєднанні з кастомними провайдерами NestJS (Custom Providers).

**ТЗ для імплементації:**
1. У `LlmModule` створити Factory Providers (використовуючи `useFactory`).
2. Зареєструвати Injection Tokens, наприклад:
   - `PRIMARY_LLM_TOKEN`
   - `FAST_LLM_TOKEN`
3. Фабрика повинна інжектити `ConfigService`, читати з нього ключі, параметри (`temperature`, `model`) та повертати готовий об'єкт `ChatOpenAI`.
4. `LlmService` повинен отримувати готові екземпляри моделей через конструктор (використовуючи декоратор `@Inject('PRIMARY_LLM_TOKEN')`).

---

## 3. Action Items для Розробника

### Крок 1: Рефакторинг Exception Handling (Повернення до KISS)
- Видалити створені на Фазі 1 окремі файли стратегій з теки `strategies/`.
- Залишити в `AllExceptionsFilter` більш елегантний мапінг або використати єдиний хелпер клас (наприклад, `ErrorClassifier`), який прибере переускладнення архітектури, але залишить код чистим від `if-else` спагетті.

### Крок 2: Імплементація Model Factory
- Відкрити `src/modules/llm.module.ts`.
- Додати у масив `providers` кастомні провайдери. Приклад:
  ```typescript
  {
    provide: 'PRIMARY_LLM',
    useFactory: (config: ConfigService) => {
      return new ChatOpenAI({
        openAIApiKey: config.get('openai.apiKey'),
        modelName: config.get('openai.model'),
        temperature: config.get('openai.temperature'),
      });
    },
    inject: [ConfigService],
  }
  ```
- Зробити те ж саме для `FAST_LLM` та `EMBEDDINGS_MODEL` (в `EmbeddedModule`).
- Відкрити `LlmService.ts` і змінити конструктор:
  ```typescript
  constructor(
    @Inject('PRIMARY_LLM') private readonly primaryModel: ChatOpenAI,
    @Inject('FAST_LLM') private readonly fastModel: ChatOpenAI,
  ) {}
  ```
- Видалити весь код, пов'язаний зі створенням `new ChatOpenAI(...)` всередині сервісів.
