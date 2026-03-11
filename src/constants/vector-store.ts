export const INDEX_NAME = 'knowledge-base';
export const VECTOR_DIMENSION = 1536;

export const MEMORY_CONFIG = {
  maxWindowTokens: 3000,
  summarisationThreshold: 0.8,
  ltmTopK: 5,
  ltmIndexName: 'ltm-conversations',
  embeddingDimension: VECTOR_DIMENSION,
};
