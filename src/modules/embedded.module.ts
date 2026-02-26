import { Module } from '@nestjs/common';
import { EmbeddedService } from 'src/services/embedded/embedded.service';

@Module({
  exports: [EmbeddedService],
  providers: [EmbeddedService],
})
export class EmbeddedModule {}
