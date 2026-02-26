import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

export const AgentState = Annotation.Root({
  question: Annotation<string>,

  // Рішення агента: 'search' | 'direct' | 'tools'
  plan: Annotation<string>,

  // Документи знайдені в OpenSearch
  documents: Annotation<Document[]>,

  // Фінальна відповідь
  answer: Annotation<string>,

  // Джерела (для відображення користувачу)
  sources: Annotation<Array<{ source: string; preview: string }>>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // Кроки які агент пройшов (для відстеження thinking process)
  steps: Annotation<string[]>({
    // reducer — як оновлювати масив: додавати нові елементи до існуючих
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ── NEW: контекст пам'яті від MemoryOrchestrator ──
  // Містить system prompt + LTM + summary + active window
  memoryContext: Annotation<Array<{ role: string; content: string }>>({
    reducer: (_, update) => update,
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentState.State;
