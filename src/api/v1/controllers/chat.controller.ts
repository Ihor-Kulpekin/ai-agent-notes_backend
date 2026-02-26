import {
  Body,
  Controller,
  Delete,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ChatService } from 'src/services/chat/chat.service';
import { ChatRequestDto } from 'src/dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: ChatRequestDto) {
    if (!body.message || body.message.trim().length === 0) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    const userId = body.userId?.trim() || 'default-user';
    const result = await this.chatService.ask(body.message.trim(), userId);

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
  clearMemory(@Query('userId') userId?: string) {
    this.chatService.clearMemory(userId || 'default-user');

    return {
      success: true,
      message: `Memory cleared for user "${userId || 'default-user'}"`,
    };
  }
}
