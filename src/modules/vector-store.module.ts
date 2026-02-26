import { Module } from '@nestjs/common';
import { VectorStoreService } from 'src/services/vectore-store/vector-store.service';
import { OpenSearchRepository } from 'src/repositories/opensearch.repository';
import { EmbeddedModule } from 'src/modules/embedded.module';

@Module({
  imports: [EmbeddedModule],
  providers: [VectorStoreService, OpenSearchRepository],
  exports: [VectorStoreService],
})
export class VectorStoreModule {}
