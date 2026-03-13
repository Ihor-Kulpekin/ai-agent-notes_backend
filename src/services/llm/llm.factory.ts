import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

export interface ModelOptions {
  modelName?: string;
  temperature?: number;
  maxRetries?: number;
  timeout?: number;
}

// Словник стратегій: ключ - назва провайдера, значення - функція фабрика
export const modelProviders: Record<
  string,
  (config: ConfigService, opts: ModelOptions) => BaseChatModel
> = {
  openai: (config, opts) => {
    return new ChatOpenAI({
      openAIApiKey: config.get<string>('openai.apiKey'),
      modelName: opts.modelName || config.get<string>('openai.model', 'gpt-4o'),
      temperature:
        opts.temperature ?? config.get<number>('openai.temperature', 0.7),
      maxRetries: opts.maxRetries ?? 3,
      timeout: opts.timeout,
    });
  },
};

export const createModelFactory = (
  configPathProvider: string,
  defaultOptions: ModelOptions,
) => {
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
