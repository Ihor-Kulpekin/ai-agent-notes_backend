import { HttpException, HttpStatus } from '@nestjs/common';

export class OpenAIException extends HttpException {
  constructor(
    message: string = 'AI Service temporarily unavailable. Please try again later.',
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
