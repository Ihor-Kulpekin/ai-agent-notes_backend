import { HttpException, HttpStatus } from '@nestjs/common';

export class OpenSearchException extends HttpException {
  constructor(
    message: string = 'Search service connection issue. Our team is notified.',
  ) {
    super(message, HttpStatus.BAD_GATEWAY);
  }
}
