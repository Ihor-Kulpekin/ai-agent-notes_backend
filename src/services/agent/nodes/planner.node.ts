import { ChatOpenAI } from '@langchain/openai';
import { AgentStateType } from 'src/services/agent/agent.state';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { PLANNER_PROMPT } from 'src/constants/prompts';

/**
 * PLANNER node — аналізує питання і вирішує стратегію:
 * - 'search' → простий пошук по документах
 * - 'tools' → потрібен спеціальний інструмент (summary, compare, list)
 * - 'direct' → відповідь без пошуку
 */
export function createPlannerNode(llm: ChatOpenAI) {
  return async (state: AgentStateType) => {
    const messages: (SystemMessage | HumanMessage)[] = [
      new SystemMessage(PLANNER_PROMPT),
    ];

    if (state.memoryContext && state.memoryContext.length > 1) {
      const historyBlock = buildHistoryBlock(state.memoryContext);
      if (historyBlock) {
        messages.push(
          new HumanMessage(
            `Recent conversation context:\n${historyBlock}\n\nNow decide the strategy for the next question:`,
          ),
        );
      }
    }

    messages.push(new HumanMessage(state.question));

    const response = await llm.invoke(messages);

    const planText = (response.content as string).trim().toLowerCase();

    let plan: string;
    if (planText.includes('tools')) {
      plan = 'tools';
    } else if (planText.includes('search')) {
      plan = 'search';
    } else {
      plan = 'direct';
    }

    return {
      plan,
      steps: [`PLAN: decided "${plan}" for: "${state.question}"`],
    };
  };
}

/**
 * Витягує останні кілька повідомлень з memoryContext для планера.
 * Не даємо system prompt і LTM — тільки останні 3-4 обміни,
 * щоб планер розумів контекст без зайвих токенів.
 */
function buildHistoryBlock(
  memoryContext: Array<{ role: string; content: string }>,
): string | null {
  // Пропускаємо system (index 0) і поточне питання (останній)
  const history = memoryContext.slice(1, -1);
  if (history.length === 0) return null;

  // Беремо максимум останні 6 повідомлень (3 обміни user/assistant)
  const recent = history.slice(-6);

  return recent
    .map((msg) => `${msg.role}: ${msg.content.substring(0, 200)}`)
    .join('\n');
}
