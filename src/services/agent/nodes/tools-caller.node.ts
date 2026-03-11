import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { AgentStateType } from '../agent.state';
import { buildMessagesFromMemory } from '../utils/message-builder';
import { Runnable } from '@langchain/core/runnables';

import { TOOLS_CALLER_PROMPT } from 'src/constants/prompts';

export function createToolsCallerNode(llmWithTools: Runnable) {
  return async (state: AgentStateType) => {
    const messages = buildMessages(state);
    const response = (await llmWithTools.invoke(messages)) as BaseMessage;

    return {
      messages: [response],
      steps: [
        `TOOLS_CALLER: LLM decided which tool to use(memory: ${state.memoryContext?.length > 0 ? 'yes' : 'no'})`,
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
function buildMessages(state: AgentStateType): BaseMessage[] {
  const hasMemory = state.memoryContext && state.memoryContext.length > 0;

  if (hasMemory) {
    return buildMessagesFromMemory(state, {
      systemSuffix:
        '\n\nYou have access to tools. Use the appropriate tool to answer the question.',
      historyLimit: 4,
    });
  }

  // Fallback
  return [
    new SystemMessage(TOOLS_CALLER_PROMPT),
    new HumanMessage(state.question),
  ];
}
