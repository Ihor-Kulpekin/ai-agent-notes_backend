import { Module } from '@nestjs/common';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { EmbeddedModule } from 'src/modules/embedded.module';
import { OpenSearchModule } from 'src/modules/opensearch.module';

@Module({
  imports: [EmbeddedModule, OpenSearchModule],
  providers: [VectorStoreService],
  exports: [VectorStoreService],
})
export class VectorStoreModule {}
