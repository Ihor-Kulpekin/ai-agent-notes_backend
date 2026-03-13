# Усунення Хардкоду: Динамічна Фабрика Моделей (ModelFactory)

## Проблема поточного рішення (Фаза 1)
У `src/modules/llm.module.ts` ми захардкодили ініціалізацію `new ChatOpenAI(...)`. 
Це порушує **Open/Closed Principle**: якщо завтра ми захочемо додати підтримку Anthropic (Claude) або Google Gemini (що описано у наших планах по впровадженню LLM Fallbacks), нам доведеться змінювати код самого модуля, додавати нові `if-else` або переписувати існуючий код.

## Архітектурний Патерн: Strategy + Factory Method

Нам потрібна **динамічна фабрика**, яка реєструє провайдерів як словник (`Record<string, Function>`). 
Конфігурація (через `.env`) повинна вказувати поточного провайдера (`LLM_PROVIDER=openai` або `LLM_PROVIDER=anthropic`), а фабрика — конструювати відповідну модель на льоту (лінива ініціалізація).

### 1. Інтерфейс та Словник Провайдерів (Strategy)

Створіть файл `src/services/llm/llm.factory.ts`:

```typescript
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
// import { ChatAnthropic } from '@langchain/anthropic'; // Для майбутнього

export interface ModelOptions {
  modelName?: string;
  temperature?: number;
  maxRetries?: number;
  timeout?: number;
  // інші спільні налаштування...
}

// Словник стратегій: ключ - назва провайдера, значення - функція фабрика
export const modelProviders: Record<string, (config: ConfigService, opts: ModelOptions) => BaseChatModel> = {
  openai: (config, opts) => {
    return new ChatOpenAI({
      openAIApiKey: config.get<string>('openai.apiKey'),
      modelName: opts.modelName || config.get<string>('openai.model', 'gpt-4o'),
      temperature: opts.temperature ?? config.get<number>('openai.temperature', 0.7),
      maxRetries: opts.maxRetries ?? 3,
      timeout: opts.timeout,
    });
  },
  
  // Приклад лінивої ініціалізації: 
  // 'anthropic' викличеться ТІЛЬКИ якщо LLM_PROVIDER=anthropic.
  // anthropic: (config, opts) => {
  //   return new ChatAnthropic({
  //     anthropicApiKey: config.get<string>('anthropic.apiKey'),
  //     modelName: opts.modelName || 'claude-3-opus-20240229',
  //     temperature: opts.temperature ?? 0.7,
  //   });
  // }
};
```

### 2. NestJS Factory Wrapper

Створіть універсальну функцію для NestJS `useFactory`, яка читатиме конфіг і делегуватиме створення словнику-фабриці.

```typescript
// src/services/llm/llm.factory.ts (продовження)

export const createModelFactory = (configPathProvider: string, defaultOptions: ModelOptions) => {
  return (config: ConfigService): BaseChatModel => {
    // Читаємо провайдера з конфігу (за замовчуванням 'openai')
    const providerKey = config.get<string>(configPathProvider, 'openai');
    
    const factoryFn = modelProviders[providerKey];
    if (!factoryFn) {
      throw new Error(`Model provider "${providerKey}" is not supported.`);
    }

    return factoryFn(config, defaultOptions);
  };
};
```

### 3. Інтеграція в `LlmModule` (NestJS DI)

Тепер у `src/modules/llm.module.ts` ми більше не знаємо про `ChatOpenAI`. Ми використовуємо нашу абстрактну фабрику.

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from 'src/services/llm/LlmService';
import { createModelFactory } from 'src/services/llm/llm.factory';

export const PRIMARY_LLM_TOKEN = 'PRIMARY_LLM';
export const BACKUP_LLM_TOKEN = 'BACKUP_LLM';
export const FAST_LLM_TOKEN = 'FAST_LLM';

@Module({
  providers: [
    {
      provide: PRIMARY_LLM_TOKEN,
      // Читаємо env.LLM_PROVIDER_PRIMARY, передаємо опції
      useFactory: createModelFactory('llm.primaryProvider', { timeout: 10000, maxRetries: 1 }),
      inject: [ConfigService],
    },
    {
      provide: BACKUP_LLM_TOKEN,
      // Вбудований fallback-провайдер: бекап може бути від іншого вендора! (наприклад: 'gemini')
      useFactory: createModelFactory('llm.backupProvider', { maxRetries: 3 }),
      inject: [ConfigService],
    },
    {
      provide: FAST_LLM_TOKEN,
      useFactory: createModelFactory('llm.fastProvider', { temperature: 0, maxRetries: 3 }),
      inject: [ConfigService],
    },
    LlmService,
  ],
  exports: [LlmService, PRIMARY_LLM_TOKEN, BACKUP_LLM_TOKEN, FAST_LLM_TOKEN],
})
export class LlmModule {}
```

## Переваги цього дизайну (Чому це краще за поточний хардкод?)

1. **Open/Closed Principle:** Щоб додати підтримку нової LLM, потрібно просто додати новий рядок у `modelProviders`. Модулі NestJS (такі як `llm.module.ts`) змінювати не потрібно!
2. **True Fallbacks:** Архітектура дозволяє мати Primary модель від OpenAI, а при її падінні перемикатися на Backup модель... Скажімо, від Anthropic. Вказуємо в `.env` різні провайдери і система працює.
3. **Lazy Instantiation:** SDK нових провайдерів (наприклад, `@langchain/anthropic`) можна завантажувати і створювати інстанси лише тоді, коли їх реально просять у конфігу, уникаючи конфліктів ключів доступу та проблем із пам'яттю.
