import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

@Injectable()
export class LlmService {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
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
