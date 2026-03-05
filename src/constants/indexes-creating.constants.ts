import { MEMORY_CONFIG, VECTOR_DIMENSION } from 'src/constants/vector-store';

export const indexCreationDocument = {
  settings: {
    'index.knn': true,
  },
  mappings: {
    properties: {
      embedding: {
        type: 'knn_vector',
        dimension: VECTOR_DIMENSION,
        method: {
          name: 'hnsw',
          space_type: 'cosinesimil',
          engine: 'lucene',
        },
      },
      content: {
        type: 'text',
      },
      metadata: {
        type: 'object',
        enabled: true,
      },
    },
  },
};

export const indexLongTermMemoryCreation = {
  settings: {
    'index.knn': true,
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      embedding: {
        type: 'knn_vector',
        dimension: MEMORY_CONFIG.embeddingDimension,
        method: {
          name: 'hnsw',
          space_type: 'cosinesimil',
          engine: 'lucene',
        },
      },
      content: { type: 'text' },
      userId: { type: 'keyword' },
      sessionId: { type: 'keyword' },
      role: { type: 'keyword' },
      timestamp: { type: 'long' },
    },
  },
};
