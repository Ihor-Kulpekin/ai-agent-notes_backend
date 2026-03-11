import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { createSummarizeTool } from 'src/services/agent/tools/summarize.tool';
import { createCompareTool } from 'src/services/agent/tools/compare.tool';
import { createListTool } from 'src/services/agent/tools/create-list.tool';

export function createAgentTools(
  llm: BaseChatModel,
  vectorStore: VectorStoreService,
) {
  return [
    createSummarizeTool(llm as any, vectorStore),
    createCompareTool(llm as any, vectorStore),
    createListTool(vectorStore),
  ];
}
