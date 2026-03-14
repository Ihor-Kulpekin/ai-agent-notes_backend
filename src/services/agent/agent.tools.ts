import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { createSummarizeTool } from 'src/services/agent/tools/summarize.tool';
import { createCompareTool } from 'src/services/agent/tools/compare.tool';
import { createListTool } from 'src/services/agent/tools/create-list.tool';

export function createAgentTools(
  fastLlm: BaseChatModel,
  llmWithFallbacks: BaseChatModel,
  vectorStore: VectorStoreService,
) {
  return [
    createSummarizeTool(fastLlm, vectorStore), // Light tasks can use fastLlm
    createCompareTool(llmWithFallbacks, vectorStore), // Compare might need more reasoning, use fallback-protected LLM
    createListTool(vectorStore),
  ];
}
