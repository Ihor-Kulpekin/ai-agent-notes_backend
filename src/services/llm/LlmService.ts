import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * LlmService — управляє двома LLM інстанціями:
 *
 * 1. `primaryModel` — основна модель (gpt-4o) для RAG Generation.
 *    Висока якість, більша вартість.
 *
 * 2. `fastModel` — легка класифікаційна модель (gpt-4o-mini) для:
 *    - Planner (вибір стратегії)
 *    - Grader (валідація відповіді)
 *    - Summarisation (STM)
 *    Менша затримка (-40%), нижча вартість (-85%).
 *
 * Tiered Model Strategy з ai-lead-roadmap.md §4.3.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  // Use BaseChatModel since withFallbacks returns it
  private primaryModel: BaseChatModel;
  private fastModel: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    // Primary model: high quality, but can fail or hit rate limits
    const primary = new ChatOpenAI({
      openAIApiKey: this.configService.get<string>('openai.apiKey'),
      modelName: this.configService.get<string>('openai.model', 'gpt-4o'),
      temperature: this.configService.get<number>('openai.temperature', 0.7),
      maxRetries: 1, // Fail fast to switch to backup
      timeout: 10000,
    });

    // Backup model for primary
    const backup = new ChatOpenAI({
      openAIApiKey: this.configService.get<string>('openai.apiKey'),
      modelName: this.configService.get<string>(
        'openai.fallbackModel',
        'gpt-4o-mini',
      ),
      temperature: this.configService.get<number>('openai.temperature', 0.7),
      maxRetries: 3,
    });

    // Step 2: LLM Resilience (Provider Fallback)
    // @ts-expect-error - RunnableWithFallbacks implements BaseChatModel runtime methods
    this.primaryModel = primary.withFallbacks({
      fallbacks: [backup],
    });

    // Fast model: for classification tasks (planner, grader, summarisation)
    this.fastModel = new ChatOpenAI({
      openAIApiKey: this.configService.get<string>('openai.apiKey'),
      modelName: this.configService.get<string>(
        'openai.fallbackModel',
        'gpt-4o-mini',
      ),
      temperature: 0, // Детермінований для classification
      maxRetries: 3,
    });

    this.logger.log(
      `LLM initialized: primary=${this.configService.get('openai.model')} (with fallback), ` +
        `fast=${this.configService.get('openai.fallbackModel')}`,
    );
  }

  /**
   * Основна модель для RAG-відповідей.
   * Повертає Runnable (оскільки обгорнута у fallbacks), який сумісний з ChatOpenAI.
   */
  getModel(): BaseChatModel {
    return this.primaryModel;
  }

  /**
   * Легка модель для planner, grader, summarisation.
   * Нижча затримка, нижча вартість.
   */
  getFastModel(): ChatOpenAI {
    return this.fastModel;
  }

  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.primaryModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);
    return response.content as string;
  }

  async invokeFast(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.fastModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);
    return response.content as string;
  }
}
