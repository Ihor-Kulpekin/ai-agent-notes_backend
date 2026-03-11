import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').trim(),
  userId: z.string().optional().default('default-user'),
  // sessionId → LangGraph thread_id for checkpointer thread persistence
  sessionId: z.string().optional(),
});

export type ChatRequestDto = z.infer<typeof chatRequestSchema>;

/**
 * DTO для Human-in-the-Loop resume/reject.
 *
 * action: 'approve' — підтвердити виконання tool
 * action: 'reject'  — відхилити, відповісти без tool
 * feedback: необов'язковий текст (причина відмови або додаткова інструкція)
 *
 * Використовується в: POST /chat/resume
 */
export const resumeRequestSchema = z.object({
  threadId: z.string().min(1, 'threadId is required'),
  action: z.enum(['approve', 'reject']),
  feedback: z.string().optional(),
});

export type ResumeRequestDto = z.infer<typeof resumeRequestSchema>;

export class ChatSourceDto {
  source: string;
  preview: string;
}

export class ChatPendingActionDto {
  node: string;
  toolName: string;
  toolArgs: unknown;
  description: string;
}

export class ChatResponseDto {
  answer: string;
  model: string;
  sources?: ChatSourceDto[];
  steps?: string[];
  // Thread persistence: клієнт зберігає threadId для resume
  threadId?: string;
  // HITL: 'completed' або 'pending_approval'
  status?: 'completed' | 'pending_approval';
  // Деталі pending tool call (є лише при status='pending_approval')
  pendingAction?: ChatPendingActionDto;
}
