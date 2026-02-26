export class ChatRequestDto {
  message: string;
  userId?: string;
}

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
