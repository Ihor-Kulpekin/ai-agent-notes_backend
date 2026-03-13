import { Injectable, Inject, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '@nestjs/config';
import {
  PRIMARY_LLM_TOKEN,
  BACKUP_LLM_TOKEN,
  FAST_LLM_TOKEN,
} from 'src/modules/llm.module';

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

  // Use Runnable for the fallback chain and ChatOpenAI for the raw model
  private fallbackModel: BaseChatModel;

  constructor(
    private readonly configService: ConfigService,
    @Inject(PRIMARY_LLM_TOKEN) private readonly rawPrimaryModel: ChatOpenAI,
    @Inject(BACKUP_LLM_TOKEN) private readonly backupModel: ChatOpenAI,
    @Inject(FAST_LLM_TOKEN) private readonly fastModel: ChatOpenAI,
  ) {
    // Step 2: LLM Resilience (Provider Fallback)
    // @ts-expect-error - RunnableWithFallbacks implements BaseChatModel runtime methods
    this.fallbackModel = this.rawPrimaryModel.withFallbacks({
      fallbacks: [this.backupModel],
    });

    this.logger.log(
      `LLM initialized: primary=${this.configService.get('openai.model')} (with fallback), ` +
      `fast=${this.configService.get('openai.fallbackModel')}`,
    );
  }

  /**
   * Повертає модель обгорнуту у fallbacks для безпечної генерації (Generator).
   */
  getModelWithFallbacks(): BaseChatModel {
    return this.fallbackModel;
  }

  /**
   * Основна сира ChatOpenAI модель.
   * Необхідна для виклику специфічних методів, таких як bindTools(),
   * оскільки RunnableWithFallbacks їх не підтримує.
   */
  getModel(): ChatOpenAI {
    return this.rawPrimaryModel;
  }

  /**
   * Легка модель для planner, grader, summarisation.
   * Нижча затримка, нижча вартість.
   */
  getFastModel(): ChatOpenAI {
    return this.fastModel;
  }

  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.fallbackModel.invoke([
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

