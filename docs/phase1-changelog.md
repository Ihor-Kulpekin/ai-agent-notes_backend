# Phase 1 Changelog: Model Factory & Exception KISS/DRY

## 1. Рефакторинг Exception Handling (KISS & DRY)
- **Видалені файли:** Директорія `src/filters/strategies/` з 5 файлами-стратегіями повністю видалена (усунено overengineering).
- **Змінені файли:** `src/filters/all-exceptions.filter.ts`.
- **Суть змін:** Замість патерну Strategy використано простий приватний метод `mapException()`, який інкапсулює базову Business Logic для мапінгу об'єкта `exception` у структуру `{ status, message }`. Це прибрало дублювання коду обробки `instanceof Error` та зробило код значно простішим і зрозумілішим.

## 2. Імплементація Динамічної ModelFactory (Strategy + Factory Map)
Відповідно до ТЗ архітектора, замість хардкоду ми створили повноцінну фабрику моделей з використанням паттернів Strategy та Registry.

- **Створені файли:**
  - `src/services/llm/llm.factory.ts` — словник провайдерів `modelProviders` та метод `createModelFactory`.
  - `src/services/embedded/embeddings.factory.ts` — словник провайдерів `embeddingsModelProviders`.
- **Змінені файли:** 
  - `src/config/app.config.ts` (додано поле `llm` для конфігурації провайдерів).
  - `src/modules/llm.module.ts` (інтеграція Custom Providers).
  - `src/modules/embedded.module.ts`.
  - `src/services/llm/LlmService.ts`.
  - `src/services/embedded/embedded.service.ts`.
- **Суть змін:** Фабрика тепер динамічно і ліниво створює об'єкти моделей `BaseChatModel` виключно на основі значень з `.env` (`LLM_PRIMARY_PROVIDER` тощо). Бізнес-логіка та DI-модулі більше не знають про `ChatOpenAI`. 

### Приклад створення фабрики-провайдера (llm.module.ts):
```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createModelFactory } from 'src/services/llm/llm.factory';

export const PRIMARY_LLM_TOKEN = 'PRIMARY_LLM';

@Module({
  providers: [
    {
      provide: PRIMARY_LLM_TOKEN,
      // Делегуємо створення нашій динамічній фабриці.
      // Вона прочитає конфіг 'llm.primaryProvider' і поверне правильну модель.
      useFactory: createModelFactory('llm.primaryProvider', {
        timeout: 10000,
        maxRetries: 1,
      }),
      inject: [ConfigService],
    },
    // ...
  ],
})
export class LlmModule {}
```

## 3. Перевірка типів
- Код успішно компілюється TypeScript у Strict Mode, жодного використання `any`.
- Усі нові залежності коректно типізовані базовими інтерфейсами LangChain (`BaseChatModel`, `Embeddings`).
