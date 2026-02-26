import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { VectorStoreService } from '../../vectore-store/vector-store.service';

export function createListTool(vectorStore: VectorStoreService) {
  return new DynamicStructuredTool({
    name: 'list_documents',
    description:
      'Lists all available documents in the knowledge base. Use when the user asks what documents are available, what files were uploaded, or needs to know document names.',
    schema: z.object({}),
    func: async () => {
      const docs = await vectorStore.similaritySearch('document', 50);

      const filenames = [
        ...new Set(docs.map((doc) => doc.metadata.source as string)),
      ];

      if (filenames.length === 0) {
        return 'No documents found in the knowledge base. Please upload some files first.';
      }

      return `Available documents:\n${filenames.map((name, i) => `${i + 1}. ${name}`).join('\n')}`;
    },
  });
}
