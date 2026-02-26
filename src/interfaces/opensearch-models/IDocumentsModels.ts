export interface IDocumentOpenSearchModel {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}
