import { AgentStateType } from 'src/services/agent/agent.state';

/**
 * Router для ноди grader — вирішує чи відповідь пройшла перевірку.
 *
 * - 'pass' → END (відповідь якісна)
 * - 'retry' → generator (повторна генерація з feedback)
 *
 * IMPORTANT: retryCount обмежує кількість ітерацій до 2,
 * щоб уникнути нескінченних циклів (з ai-lead-roadmap.md §2.2 WARNING).
 */
export function routeAfterGrading(state: AgentStateType): 'pass' | 'retry' {
  const MAX_RETRIES = 2;

  if (state.retryCount >= MAX_RETRIES) {
    return 'pass'; // Виходимо навіть якщо grader незадоволений
  }

  // gradingFeedback: порожній рядок → pass, є текст → retry
  if (state.gradingFeedback && state.gradingFeedback.trim().length > 0) {
    return 'retry';
  }

  return 'pass';
}
