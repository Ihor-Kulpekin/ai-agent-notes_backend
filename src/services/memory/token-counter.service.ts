import { Injectable, Logger } from '@nestjs/common';
import {
  encoding_for_model,
  type Tiktoken,
  type TiktokenModel,
} from 'tiktoken';
import { IChatMessage } from 'src/interfaces/memory/IMemoryModels';

@Injectable()
export class TokenCounterService {
  private readonly logger = new Logger(TokenCounterService.name);
  private encoder: Tiktoken;

  onModuleInit(): void {
    try {
      this.encoder = encoding_for_model('gpt-4o' as TiktokenModel);
      this.logger.log('Tiktoken encoder initialised (gpt-4o)');
    } catch {
      this.encoder = encoding_for_model('gpt-4' as TiktokenModel);
      this.logger.warn('Fallback to gpt-4 tiktoken encoding');
    }
  }

  count(text: string): number {
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  countMessages(messages: IChatMessage[]): number {
    const OVERHEAD_PER_MSG = 4;
    return messages.reduce((total, msg) => {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
      const tokenCount = (msg as IChatMessage & { tokenCount?: number })
        .tokenCount;
      return total + (tokenCount ?? this.count(content)) + OVERHEAD_PER_MSG;
    }, 3);
  }
}
