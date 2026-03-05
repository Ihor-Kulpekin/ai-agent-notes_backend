import {
  Body,
  Controller,
  Delete,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ChatService } from 'src/services/chat/chat.service';
import { chatRequestSchema } from 'src/dto/chat.dto';
import type { ChatRequestDto } from 'src/dto/chat.dto';
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(chatRequestSchema))
  async chat(@Body() body: ChatRequestDto) {
    const result = await this.chatService.ask(body.message, body.userId);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * DELETE /chat/memory?userId=xxx
   * Очищає всю пам'ять (STM + summary) для користувача.
   */
  @Delete('memory')
  async clearMemory(@Query('userId') userId?: string) {
    await this.chatService.clearMemory(userId || 'default-user');

    return {
      success: true,
      message: `Memory cleared for user "${userId || 'default-user'}"`,
    };
  }
}
