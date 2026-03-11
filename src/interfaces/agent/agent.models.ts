export interface IAgentPendingAction {
  node: string;
  toolName: string;
  toolArgs: unknown;
  description: string;
}

export interface IAgentResponse {
  answer: string;
  sources: Array<{ source: string; preview: string }>;
  steps: string[];
  model: string;
  threadId?: string;
  status?: 'completed' | 'pending_approval';
  pendingAction?: IAgentPendingAction;
}
