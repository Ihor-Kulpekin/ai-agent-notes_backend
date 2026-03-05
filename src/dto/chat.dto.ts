import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').trim(),
  userId: z.string().optional().default('default-user'),
});

export type ChatRequestDto = z.infer<typeof chatRequestSchema>;

export class ChatSourceDto {
  source: string;
  preview: string;
}

export class ChatResponseDto {
  answer: string;
  model: string;
  sources?: ChatSourceDto[];
  steps?: string[]; // Кроки агента (thinking process)
}
