export interface IChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokenCount?: number;
}

export interface IConversationSummary {
  content: string;
  tokenCount: number;
  coveredUpTo: number;
}

export interface ISemanticSearchResult {
  content: string;
  role: 'user' | 'assistant';
  score: number;
  timestamp: number;
  sessionId: string;
}

export interface IFinalPromptContext {
  systemPrompt: string;
  longTermMemory: ISemanticSearchResult[];
  summary: string | null;
  activeWindow: IChatMessage[];
  currentUserMessage: string;
}

export interface ILtmDocument {
  content: string;
  embedding: number[];
  userId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  timestamp: number;
}
