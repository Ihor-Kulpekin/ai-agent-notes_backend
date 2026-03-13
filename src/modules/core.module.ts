import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from 'src/config/app.config';
import { HealthModule } from 'src/modules/health.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    HealthModule,
  ],
  exports: [ConfigModule, HealthModule],
})
export class CoreModule {}
