import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';

export const AgentState = Annotation.Root({
  question: Annotation<string>,

  // Рішення агента: 'search' | 'direct' | 'tools'
  plan: Annotation<string>,

  // Оптимізований пошуковий запит (генерується Query Rewriter)
  searchQuery: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),

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
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Контекст пам'яті від MemoryOrchestrator
  // Містить system prompt + LTM + summary + active window
  memoryContext: Annotation<Array<{ role: string; content: string }>>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // ── P1: Self-correction ──
  // Лічильник спроб самокорекції (захист від нескінченних циклів)
  retryCount: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

  // Зворотній зв'язок від grader до generator (пояснення чому відповідь не пройшла)
  gradingFeedback: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

export type AgentStateType = typeof AgentState.State;
