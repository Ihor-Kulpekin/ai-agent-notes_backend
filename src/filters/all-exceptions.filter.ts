import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const body = res as Record<string, unknown>;
        message =
          typeof body.message === 'string'
            ? body.message
            : JSON.stringify(body.message);
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      const errMessage = exception.message.toLowerCase();

      // OpenAI errors
      if (errMessage.includes('openai') || errMessage.includes('rate limit')) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'AI Service temporarily unavailable. Please try again later.';
      }
      // OpenSearch errors
      else if (
        errMessage.includes('opensearch') ||
        errMessage.includes('connection')
      ) {
        status = HttpStatus.BAD_GATEWAY;
        message = 'Search service connection issue. Our team is notified.';
      } else {
        message = exception.message;
      }
    }

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
}
