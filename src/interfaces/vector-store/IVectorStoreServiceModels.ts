export interface IOpenSearchHit {
  _source: {
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
  };
  _score: number;
}

export interface IOpenSearchResponse {
  body: {
    hits: {
      hits: IOpenSearchHit[];
    };
  };
}

export interface IAggBucket {
  key: string;
  doc_count: number;
  latest_upload?: {
    value_as_string?: string;
  };
}
