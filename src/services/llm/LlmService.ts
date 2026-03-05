import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

@Injectable()
export class LlmService {
  private model: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.model = new ChatOpenAI({
      openAIApiKey: this.configService.get<string>('openai.apiKey'),
      modelName: this.configService.get<string>('openai.model'),
      temperature: this.configService.get<number>('openai.temperature'),
      maxRetries: 3,
    });
  }

  async invoke(systemPrompt: string, userMessage: string) {
    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);

    return response.content;
  }

  getModel(): ChatOpenAI {
    return this.model;
  }
}
