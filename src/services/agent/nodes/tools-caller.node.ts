import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentStateType } from '../agent.state';

const TOOLS_CALLER_PROMPT =
  "You are a helpful assistant with access to tools. Use the appropriate tool to answer the user's question. Answer in the same language as the question.";

export function createToolsCallerNode(llmWithTools: ChatOpenAI) {
  return async (state: AgentStateType) => {
    const messages = buildMessages(state);
    const response = await llmWithTools.invoke(messages);

    return {
      messages: [response],
      steps: [
        `TOOLS_CALLER: LLM decided which tool to use (memory: ${state.memoryContext?.length > 0 ? 'yes' : 'no'})`,
      ],
    };
  };
}

/**
 * З memoryContext: system prompt (LTM + summary) + history + поточне питання.
 * Це дозволяє LLM правильно вибрати tool коли юзер каже
 * "зроби summary того файлу" або "порівняй ці два документи що ми обговорювали".
 *
 * Без memoryContext: простий prompt + question (fallback).
 */
function buildMessages(
  state: AgentStateType,
): (SystemMessage | HumanMessage)[] {
  const hasMemory = state.memoryContext && state.memoryContext.length > 0;

  if (hasMemory) {
    const memoryMessages = state.memoryContext;

    // System prompt з LTM + summary + інструкція використовувати tools
    const systemContent =
      memoryMessages[0].content +
      '\n\nYou have access to tools. Use the appropriate tool to answer the question.';

    const messages: (SystemMessage | HumanMessage)[] = [
      new SystemMessage(systemContent),
    ];

    // History — останні 4 повідомлення (2 обміни), без system і останнього user
    const history = memoryMessages.slice(1, -1).slice(-4);
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(
          new HumanMessage(`[Previous assistant response]: ${msg.content}`),
        );
      }
    }

    messages.push(new HumanMessage(state.question));
    return messages;
  }

  // Fallback
  return [
    new SystemMessage(TOOLS_CALLER_PROMPT),
    new HumanMessage(state.question),
  ];
}
