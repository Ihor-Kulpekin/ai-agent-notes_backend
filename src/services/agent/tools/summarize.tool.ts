import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { VectorStoreService } from 'src/services/vectore-store/vector-store.service';
import { ChatOpenAI } from '@langchain/openai';

export function createSummarizeTool(
  llm: ChatOpenAI,
  vectorStore: VectorStoreService,
) {
  return new DynamicStructuredTool({
    name: 'summarize_document',
    description:
      'Summarizes a specific document. Use when the user asks for a summary, brief overview, or key points of a document. Pass the filename of the document.',
    schema: z.object({
      filename: z
        .string()
        .describe('The name of the file to summarize, e.g. "notes.txt"'),
    }),
    func: async ({ filename }) => {
      // Шукаємо всі chunks цього файлу
      // Використовуємо filename як запит — знайдемо chunks з цього джерела
      const docs = await vectorStore.similaritySearch(filename, 10);

      // Фільтруємо тільки chunks з потрібного файлу
      const relevantDocs = docs.filter(
        (doc) => doc.metadata.source === filename,
      );

      if (relevantDocs.length === 0) {
        return `Document "${filename}" not found. Please check the filename.`;
      }

      // Збираємо весь текст
      const fullText = relevantDocs.map((doc) => doc.pageContent).join('\n\n');

      // Просимо LLM зробити summary
      const response = await llm.invoke([
        new SystemMessage(
          'You are a summarization assistant. Create a concise summary of the provided text. Keep the most important points. Answer in the same language as the document.',
        ),
        new HumanMessage(`Summarize this document:\n\n${fullText}`),
      ]);

      return response.content as string;
    },
  })
}