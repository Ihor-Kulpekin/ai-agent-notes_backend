import { Module } from '@nestjs/common';
import { DocumentController } from 'src/api/v1/controllers/document.controller';
import { DocumentService } from 'src/services/document/document.service';
import { VectorStoreModule } from 'src/modules/vector-store.module';

@Module({
  controllers: [DocumentController],
  imports: [VectorStoreModule],
  providers: [DocumentService],
})
export class DocumentModule {}
