import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentStateType } from 'src/services/agent/agent.state';
import { ChatOpenAI } from '@langchain/openai';

const RAG_PROMPT = `You are a helpful knowledge assistant. Answer the question based on the provided context.
If the context doesn't contain relevant information, say so honestly.
Answer in the same language as the question.

Context from documents:
{context}`;

const DIRECT_PROMPT = `You are a helpful assistant. Answer the question naturally.
Answer in the same language as the question.`;

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
  const memoryMessages = state.memoryContext;
  const hasDocuments = state.documents && state.documents.length > 0;

  const systemMsg = memoryMessages[0]; // role: 'system'
  let systemContent = systemMsg.content;

  // Якщо є документи з vector search — додаємо в system prompt
  if (hasDocuments) {
    systemContent += `\n\n## Retrieved Documents\n${formatDocuments(state.documents)}`;
  }

  const messages: (SystemMessage | HumanMessage)[] = [
    new SystemMessage(systemContent),
  ];

  // Додаємо history з memoryContext (пропускаємо system і останній user)
  const historyMessages = memoryMessages.slice(1, -1);
  for (const msg of historyMessages) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      // LangChain AIMessage — але для invoke можна використати HumanMessage trick
      // або імпортувати AIMessage
      messages.push(
        new HumanMessage(`[Previous assistant response]: ${msg.content}`),
      );
    }
  }

  // Поточне питання
  messages.push(new HumanMessage(state.question));

  return messages;
}

function formatDocuments(documents: any[]): string {
  const docs = documents as Array<{
    pageContent: string;
    metadata: Record<string, any>;
  }>;

  return docs
    .map(
      (doc, i) =>
        `[${i + 1}] (source: ${doc.metadata?.source ?? 'unknown'})\n${doc.pageContent}`,
    )
    .join('\n\n');
}
