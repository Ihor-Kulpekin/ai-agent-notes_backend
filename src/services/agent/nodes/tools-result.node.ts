import { ChatOpenAI } from '@langchain/openai';
import { AgentStateType } from 'src/services/agent/agent.state';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const TOOLS_RESULT_PROMPT = `You are a helpful assistant. Format the tool result into a clear, well-structured answer for the user. Answer in the same language as the question.`;

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
): (SystemMessage | HumanMessage)[] {
  const hasMemory = state.memoryContext && state.memoryContext.length > 0;

  if (hasMemory) {
    const memoryMessages = state.memoryContext;

    // system prompt вже містить LTM + summary
    const systemContent =
      memoryMessages[0].content +
      `\n\nAdditionally, format the tool result below into a clear answer.`;

    const messages: (SystemMessage | HumanMessage)[] = [
      new SystemMessage(systemContent),
    ];

    // Додаємо history (без system і без останнього user)
    const history = memoryMessages.slice(1, -1);
    for (const msg of history.slice(-4)) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(
          new HumanMessage(`[Previous assistant response]: ${msg.content}`),
        );
      }
    }

    // Поточне питання + результат tool
    messages.push(
      new HumanMessage(
        `User question: ${state.question}\n\nTool result:\n${toolResult}`,
      ),
    );

    return messages;
  }

  // Fallback: без пам'яті
  return [
    new SystemMessage(TOOLS_RESULT_PROMPT),
    new HumanMessage(
      `User question: ${state.question}\n\nTool result:\n${toolResult}`,
    ),
  ];
}
