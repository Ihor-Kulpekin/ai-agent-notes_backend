export interface IIndexDocumentData {
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown; // дозволяє додаткові поля (userId, sessionId, etc.)
}

export interface IKnnSearchOptions {
  index: string;
  vector: number[];
  k: number;
  filters?: Record<string, unknown>[];
  sourceFields?: string[];
}

export interface IIndexConfig {
  name: string;
  vectorDimension: number;
  extraMappings?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface IMemorySearchHit {
  _source: {
    content: string;
    role: 'user' | 'assistant';
    timestamp: number;
    sessionId: string;
  };
  _score: number;
}
