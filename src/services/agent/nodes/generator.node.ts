import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentStateType } from 'src/services/agent/agent.state';
import { ChatOpenAI } from '@langchain/openai';
import { buildMessagesFromMemory } from 'src/services/agent/utils/message-builder';

import { RAG_PROMPT, DIRECT_PROMPT } from 'src/constants/prompts';
import { Document } from '@langchain/core/documents';

/**
 * GENERATOR node — генерує фінальну відповідь.
 */
export function createGeneratorNode(llm: ChatOpenAI) {
  return async (state: AgentStateType) => {
    const messages = buildMessages(state);

    const response = await llm.invoke(messages);

    return {
      answer: response.content as string,
      steps: [
        `GENERATOR: response (${state.plan === 'search' ? 'with' : 'without'} context, ` +
          `memory: ${state.memoryContext.length > 0 ? 'yes' : 'no'})`,
      ],
    };
  };
}

/**
 * Збирає messages для LLM з урахуванням пам'яті.
 *
 * Якщо memoryContext є (прийшов від MemoryOrchestrator):
 *   - Бере system prompt з memoryContext (вже містить LTM + summary)
 *   - Якщо є документи з пошуку — додає їх в system prompt
 *   - Додає history з memoryContext
 *   - Додає поточне питання
 *
 * Якщо memoryContext немає (fallback):
 *   - Працює як раніше — RAG_PROMPT або DIRECT_PROMPT
 */
function buildMessages(state: AgentStateType) {
  const hasMemory = state.memoryContext && state.memoryContext.length > 0;
  const hasDocuments = state.documents && state.documents.length > 0;

  if (hasMemory) {
    return buildMessagesWithMemory(state);
  }

  // ── Fallback: без пам'яті (оригінальна логіка) ──
  const systemPrompt = hasDocuments
    ? RAG_PROMPT.replace('{context}', formatDocuments(state.documents))
    : DIRECT_PROMPT;

  return [new SystemMessage(systemPrompt), new HumanMessage(state.question)];
}

function buildMessagesWithMemory(state: AgentStateType) {
  const hasDocuments = state.documents && state.documents.length > 0;
  return buildMessagesFromMemory(state, {
    documentsContent: hasDocuments
      ? formatDocuments(state.documents)
      : undefined,
  });
}

function formatDocuments(documents: Document[]): string {
  return documents
    .map(
      (doc, i) =>
        `[${i + 1}] (source: ${doc.metadata?.source ?? 'unknown'})\n${doc.pageContent}`,
    )
    .join('\n\n');
}
