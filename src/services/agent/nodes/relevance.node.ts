import { AgentStateType } from 'src/services/agent/agent.state';

/**
 * RELEVANCE CHECK node — перевіряє релевантність знайдених документів.
 *
 * Це чиста умовна нода (без LLM call — нульова latency).
 * Якщо документів немає — встановлює план на 'direct', щоб
 * GENERATOR не намагався будувати RAG-відповідь з порожнього контексту.
 *
 * Патерн "Document Relevance Gate" з ai-lead-roadmap.md §2.2 (Патерн B).
 */
export function createRelevanceNode() {
  return (state: AgentStateType) => {
    const hasDocuments = state.documents && state.documents.length > 0;

    if (!hasDocuments) {
      return {
        // Перевести в direct mode: generator відповість без RAG-контексту
        plan: 'direct',
        steps: [
          'RELEVANCE_CHECK: no documents found → switching to direct mode',
        ],
      };
    }

    return {
      steps: [
        `RELEVANCE_CHECK: ${state.documents.length} documents passed relevance gate`,
      ],
    };
  };
}
