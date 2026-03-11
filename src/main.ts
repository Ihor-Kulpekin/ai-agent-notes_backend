import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Step 1: Global Observability (LangSmith Tracing)
  const configService = app.get(ConfigService);
  if (configService.get('langsmith.apiKey')) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = configService.get('langsmith.apiKey');
    process.env.LANGCHAIN_PROJECT = configService.get('langsmith.project');
    process.env.LANGCHAIN_ENDPOINT = 'https://api.smith.langchain.com';
    Logger.log(
      `Global LangSmith tracing enabled — project: ${process.env.LANGCHAIN_PROJECT}`,
      'Bootstrap',
    );
  }

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');

  app.enableCors();

  const port = process.env.PORT || 3000;

  await app.listen(port);

  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err: Error) => {
  Logger.error('Failed to start application:', err.message, 'Bootstrap');
  process.exit(1);
});
