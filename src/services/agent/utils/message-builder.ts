import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { AgentStateType } from '../agent.state';

export interface MessageBuilderOptions {
  systemSuffix?: string;
  historyLimit?: number;
  documentsContent?: string;
  finalQuestionOverride?: string;
}

export function buildMessagesFromMemory(
  state: AgentStateType,
  options?: MessageBuilderOptions,
): BaseMessage[] {
  const memoryMessages = state.memoryContext;
  if (!memoryMessages || memoryMessages.length === 0) {
    return [];
  }

  const systemMsg = memoryMessages[0]; // role: 'system'
  let systemContent = systemMsg.content;

  if (options?.documentsContent) {
    systemContent += `\n\n## Retrieved Documents\n${options.documentsContent}`;
  }

  if (options?.systemSuffix) {
    systemContent += options.systemSuffix;
  }

  const messages: BaseMessage[] = [new SystemMessage(systemContent)];

  // Додаємо history з memoryContext (пропускаємо system і останній user)
  let historyMessages = memoryMessages.slice(1, -1);

  if (options?.historyLimit && options.historyLimit > 0) {
    historyMessages = historyMessages.slice(-options.historyLimit);
  }

  for (const msg of historyMessages) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      messages.push(new AIMessage(msg.content));
    }
  }

  // Поточне питання
  const finalUserMessage = options?.finalQuestionOverride ?? state.question;
  messages.push(new HumanMessage(finalUserMessage));

  return messages;
}
