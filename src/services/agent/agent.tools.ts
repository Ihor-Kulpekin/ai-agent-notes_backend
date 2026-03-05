import { ChatOpenAI } from '@langchain/openai';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { createSummarizeTool } from 'src/services/agent/tools/summarize.tool';
import { createCompareTool } from 'src/services/agent/tools/compare.tool';
import { createListTool } from 'src/services/agent/tools/create-list.tool';

export function createAgentTools(
  llm: ChatOpenAI,
  vectorStore: VectorStoreService,
) {
  return [
    createSummarizeTool(llm, vectorStore),
    createCompareTool(llm, vectorStore),
    createListTool(vectorStore),
  ];
}
