import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { ChatOpenAI } from '@langchain/openai';

export function createCompareTool(
  llm: ChatOpenAI,
  vectorStore: VectorStoreService,
) {
  return new DynamicStructuredTool({
    name: 'compare_documents',
    description:
      'Compares two documents and highlights differences and similarities. Use when the user asks to compare, diff, or find differences between two documents.',
    schema: z.object({
      filename1: z.string().describe('The name of the first file'),
      filename2: z.string().describe('The name of the second file'),
    }),
    func: async ({ filename1, filename2 }) => {
      // Отримуємо всі chunks обох файлів напряму через filter
      const relevantDocs1 = await vectorStore.getDocumentChunks(filename1);
      const relevantDocs2 = await vectorStore.getDocumentChunks(filename2);

      if (relevantDocs1.length === 0) {
        return `Document "${filename1}" not found.`;
      }
      if (relevantDocs2.length === 0) {
        return `Document "${filename2}" not found.`;
      }

      const text1 = relevantDocs1.map((doc) => doc.pageContent).join('\n\n');
      const text2 = relevantDocs2.map((doc) => doc.pageContent).join('\n\n');

      const response = await llm.invoke([
        new SystemMessage(
          'You are a comparison assistant. Compare the two documents below. Highlight key similarities and differences. Answer in the same language as the documents.',
        ),
        new HumanMessage(
          `Document 1 (${filename1}):\n${text1}\n\n---\n\nDocument 2 (${filename2}):\n${text2}`,
        ),
      ]);

      return response.content as string;
    },
  });
}
