import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SystemMessage } from '@langchain/core/messages';
import { AgentStateType } from 'src/services/agent/agent.state';

/**
 * QUERY REWRITER node — переписує питання користувача з урахуванням
 * історії розмови для створення ідеального пошукового запиту.
 */
export function createQueryRewriterNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    const prompt = `You are a search query rewriting expert.
Rewrite the latest user question into a standalone, optimized search query for a vector database.
Use the conversation history (messages) to resolve any prorouns references (e.g., "it", "this").
ONLY output the rewritten query, nothing else. Do not wrap in quotes.`;

    const response = await llm.invoke([
      new SystemMessage(prompt),
      ...state.messages,
    ]);

    const rewrittenQuery = (response.content as string).trim();

    return {
      searchQuery: rewrittenQuery,
      steps: [`QUERY_REWRITER: optimized query → "${rewrittenQuery}"`],
    };
  };
}
