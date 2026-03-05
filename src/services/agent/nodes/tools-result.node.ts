import { ChatOpenAI } from '@langchain/openai';
import { AgentStateType } from 'src/services/agent/agent.state';
import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { buildMessagesFromMemory } from 'src/services/agent/utils/message-builder';

import { TOOLS_RESULT_PROMPT } from 'src/constants/prompts';

/**
 * TOOLS RESULT node — обробляє результат виконання tool і формує відповідь.
 */
export function createToolsResultNode(llm: ChatOpenAI) {
  return async (state: AgentStateType) => {
    // Остання повідомлення — результат tool
    const lastMessage = state.messages[state.messages.length - 1];
    const toolResult =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    const messages = buildMessages(state, toolResult);

    // Просимо LLM оформити результат tool як гарну відповідь
    const response = await llm.invoke(messages);

    return {
      answer: response.content as string,
      steps: ['TOOLS_RESULT: formatted tool output into final answer'],
    };
  };
}

/**
 * Збирає messages для LLM з урахуванням пам'яті.
 *
 * З memoryContext: system prompt (LTM + summary) + history + tool result
 * Без memoryContext: простий prompt + tool result (як раніше)
 */
function buildMessages(
  state: AgentStateType,
  toolResult: string,
): BaseMessage[] {
  const hasMemory = state.memoryContext && state.memoryContext.length > 0;

  if (hasMemory) {
    return buildMessagesFromMemory(state, {
      systemSuffix:
        '\n\nAdditionally, format the tool result below into a clear answer.',
      historyLimit: 4,
      finalQuestionOverride: `User question: ${state.question}\n\nTool result:\n${toolResult}`,
    });
  }

  // Fallback: без пам'яті
  return [
    new SystemMessage(TOOLS_RESULT_PROMPT),
    new HumanMessage(
      `User question: ${state.question}\n\nTool result:\n${toolResult}`,
    ),
  ];
}
