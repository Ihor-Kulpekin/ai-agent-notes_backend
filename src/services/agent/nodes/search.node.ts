import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { AgentStateType } from 'src/services/agent/agent.state';

/**
 * SEARCH node — шукає релевантні документи в OpenSearch.
 */
export function createSearchNode(vectorStore: VectorStoreService) {
  return async (state: AgentStateType) => {
    const documents = await vectorStore.similaritySearch(state.question, 4);

    const sources = documents.map((doc) => ({
      source: doc.metadata.source as string,
      preview: doc.pageContent.substring(0, 150) + '...',
    }));

    return {
      documents,
      sources,
      steps: [`SEARCH: found ${documents.length} relevant chunks`],
    };
  };
}
