import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { VectorStoreService } from '../../vector-store/vector-store.service';

export function createListTool(vectorStore: VectorStoreService) {
  return new DynamicStructuredTool({
    name: 'list_documents',
    description:
      'Lists all available documents in the knowledge base. Use when the user asks what documents are available, what files were uploaded, or needs to know document names.',
    schema: z.object({}),
    func: async () => {
      const docs = await vectorStore.listDocuments();

      if (docs.length === 0) {
        return 'No documents found in the knowledge base. Please upload some files first.';
      }

      return `Available documents:\n${docs.map((d, i) => `${i + 1}. ${d.filename} (${d.chunks} chunks)`).join('\n')}`;
    },
  });
}
