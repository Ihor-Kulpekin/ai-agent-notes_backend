import { Module } from '@nestjs/common';
import { HealthController } from 'src/api/v1/controllers/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
