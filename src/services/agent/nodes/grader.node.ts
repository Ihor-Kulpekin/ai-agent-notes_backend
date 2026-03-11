import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AgentStateType } from 'src/services/agent/agent.state';
import { GRADER_PROMPT } from 'src/constants/prompts';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * GRADER node — LLM-валідатор відповідей агента.
 *
 * Патерн "Grounded Answer Validator" з ai-lead-roadmap.md §2.2 (Патерн A).
 *
 * Використовує gpt-4o-mini (classification task — не потребує сильної моделі).
 * Результат:
 * - gradingFeedback: '' → відповідь пройшла (router поверне 'pass')
 * - gradingFeedback: '<опис помилки>' → повтор генерації
 * - retryCount: +1 (захист від нескінченних циклів)
 */
export function createGraderNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    // Якщо немає документів — пряма відповідь не потребує grading
    if (state.plan === 'direct' || !state.answer) {
      return { gradingFeedback: '', steps: ['GRADER: skipped (direct mode)'] };
    }
    console.log('state.documents', state.documents);
    const documentsSnippet = state.documents
      .slice(0, 3)
      .map((d, i) => `[${i + 1}] ${d.pageContent.substring(0, 300)}`)
      .join('\n');

    const userMessage = `
Question: ${state.question}

Answer to evaluate:
${state.answer}

Source documents:
${documentsSnippet || 'No documents'}
    `.trim();

    const response = await llm.invoke([
      new SystemMessage(GRADER_PROMPT),
      new HumanMessage(userMessage),
    ]);

    const responseText = (response.content as string).trim();

    // Парсимо відповідь: якщо перше слово PASS — пройшло
    const isPassing = responseText.toUpperCase().startsWith('PASS');

    const gradingFeedback = isPassing ? '' : responseText;

    return {
      gradingFeedback,
      retryCount: 1, // Incremented via reducer (current + update)
      steps: [
        `GRADER: verdict=${isPassing ? 'PASS' : 'FAIL'} (retry #${state.retryCount + 1})`,
      ],
    };
  };
}
