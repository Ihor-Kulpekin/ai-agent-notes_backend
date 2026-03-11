import { Module } from '@nestjs/common';
import { OpenSearchRepository } from 'src/repositories/opensearch.repository';

@Module({
  providers: [
    {
      provide: 'ISearchRepository',
      useClass: OpenSearchRepository,
    },
  ],
  exports: ['ISearchRepository'],
})
export class OpenSearchModule {}
