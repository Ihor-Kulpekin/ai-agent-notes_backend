import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.enableCors();

  const port = process.env.PORT || 3000;

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  await app.listen(port);

  console.log(`Server running on http://localhost:${port}`);
}

bootstrap();
