import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OpenAIException } from 'src/exceptions/openai.exception';
import { OpenSearchException } from 'src/exceptions/opensearch.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.mapException(exception);

    this.logger.error(
      `[${request.method}] ${request.url} - Error: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }

  private mapException(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      if (exception instanceof OpenAIException || exception instanceof OpenSearchException) {
        return { status: exception.getStatus(), message: exception.message };
      }
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message = exception.message;
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const body = res as Record<string, unknown>;
        message = typeof body.message === 'string' ? body.message : JSON.stringify(body.message);
      }
      return { status, message };
    }

    if (exception instanceof Error) {
      const msg = exception.message.toLowerCase();
      if (msg.includes('openai') || msg.includes('rate limit')) {
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'AI Service temporarily unavailable. Please try again later.',
        };
      }
      if (msg.includes('opensearch') || msg.includes('connection')) {
        return {
          status: HttpStatus.BAD_GATEWAY,
          message: 'Search service connection issue. Our team is notified.',
        };
      }
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: exception.message };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}

