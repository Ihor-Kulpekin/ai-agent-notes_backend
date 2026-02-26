export interface IAgentResponse {
  answer: string;
  sources: Array<{ source: string; preview: string }>;
  steps: string[];
  model: string;
}
