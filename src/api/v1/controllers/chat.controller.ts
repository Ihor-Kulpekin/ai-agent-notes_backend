import {
  Controller,
  Body,
  Delete,
  Post,
  Query,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from 'src/services/chat/chat.service';
import { chatRequestSchema, resumeRequestSchema } from 'src/dto/chat.dto';
import type { ChatRequestDto, ResumeRequestDto } from 'src/dto/chat.dto';
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /chat
   * Запускає агента. Якщо агент хоче викликати tool —
   * повертає { status: 'pending_approval', threadId, pendingAction: { toolName, toolArgs, ... } }.
   * Клієнт повинен показати користувачу pendingAction і далі викликати POST /chat/resume.
   */
  @Post()
  @UsePipes(new ZodValidationPipe(chatRequestSchema))
  async chat(@Body() body: ChatRequestDto) {
    const result = await this.chatService.ask(
      body.message,
      body.userId,
      body.sessionId,
    );
    return { success: true, data: result };
  }

  /**
   * POST /chat/resume
   * Human-in-the-Loop: відновити або скасувати виконання tool.
   *
   * Body: { threadId, action: 'approve'|'reject', feedback?: string }
   *
   * action='approve' → граф виконує tool і повертає результат
   * action='reject'  → граф переходить у direct mode і відповідає без tool
   *
   * threadId: отримується з попередньої відповіді POST /chat де status='pending_approval'
   */
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(resumeRequestSchema))
  async resume(@Body() body: ResumeRequestDto) {
    const result = await this.chatService.resumeGraph(
      body.threadId,
      body.action,
      body.feedback,
    );
    return { success: true, data: result };
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
