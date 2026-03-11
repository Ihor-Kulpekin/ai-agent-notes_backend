import { routeAfterPlan } from 'src/services/agent/router/agent.router';
import { routeAfterGrading } from 'src/services/agent/router/grader.router';
import { AgentStateType } from 'src/services/agent/agent.state';

/**
 * Deterministic Unit Tests for Agent Routing
 *
 * Ці тести перевіряють детерміновану частину AI-системи —
 * routing functions, які приймають рішення на основі стану графа.
 * На відміну від LLM-виходів, ці функції мають 100% передбачувану поведінку.
 */

// Фабрика для створення мінімального стейту під тест
function createMockState(
  overrides: Partial<AgentStateType> = {},
): AgentStateType {
  return {
    question: 'test question',
    plan: '',
    documents: [],
    answer: '',
    sources: [],
    steps: [],
    messages: [],
    memoryContext: [],
    retryCount: 0,
    gradingFeedback: '',
    ...overrides,
  } as AgentStateType;
}

// ═══════════════════════════════════════════════════════
// routeAfterPlan — Planner Router
// ═══════════════════════════════════════════════════════

describe('routeAfterPlan', () => {
  it('should route to "query_rewriter" when plan is "search"', () => {
    const state = createMockState({ plan: 'search' });
    expect(routeAfterPlan(state)).toBe('query_rewriter');
  });

  it('should route to "tools_caller" when plan is "tools"', () => {
    const state = createMockState({ plan: 'tools' });
    expect(routeAfterPlan(state)).toBe('tools_caller');
  });

  it('should route to "generator" when plan is "direct"', () => {
    const state = createMockState({ plan: 'direct' });
    expect(routeAfterPlan(state)).toBe('generator');
  });

  // ── Edge Cases: Router Hallucination Protection ──

  it('should fallback to "generator" when plan is an unexpected value', () => {
    const state = createMockState({ plan: 'banana' });
    expect(routeAfterPlan(state)).toBe('generator');
  });

  it('should fallback to "generator" when plan is empty', () => {
    const state = createMockState({ plan: '' });
    expect(routeAfterPlan(state)).toBe('generator');
  });

  it('should fallback to "generator" when plan is a full sentence from LLM', () => {
    const state = createMockState({
      plan: 'I think we should search for documents',
    });
    // Цей тест демонструє, що навіть якщо planner-нода
    // НЕ розпарсила LLM-відповідь правильно і записала повне речення,
    // router безпечно повертає generator (direct mode).
    expect(routeAfterPlan(state)).toBe('generator');
  });
});

// ═══════════════════════════════════════════════════════
// routeAfterGrading — Self-Correction Router
// ═══════════════════════════════════════════════════════

describe('routeAfterGrading', () => {
  it('should return "pass" when gradingFeedback is empty', () => {
    const state = createMockState({ gradingFeedback: '', retryCount: 0 });
    expect(routeAfterGrading(state)).toBe('pass');
  });

  it('should return "retry" when grader found issues (first attempt)', () => {
    const state = createMockState({
      gradingFeedback: 'FAIL: answer contains hallucinated facts',
      retryCount: 0,
    });
    expect(routeAfterGrading(state)).toBe('retry');
  });

  it('should return "retry" on second attempt when grader still fails', () => {
    const state = createMockState({
      gradingFeedback: 'FAIL: answer is too vague',
      retryCount: 1,
    });
    expect(routeAfterGrading(state)).toBe('retry');
  });

  // ── Infinite Loop Protection ──

  it('should force "pass" when retryCount >= MAX_RETRIES (2)', () => {
    const state = createMockState({
      gradingFeedback: 'FAIL: still bad answer',
      retryCount: 2,
    });
    // Навіть якщо grader незадоволений — ми виходимо, щоб не зациклитися
    expect(routeAfterGrading(state)).toBe('pass');
  });

  it('should force "pass" even when retryCount exceeds MAX_RETRIES', () => {
    const state = createMockState({
      gradingFeedback: 'FAIL: terrible answer',
      retryCount: 5,
    });
    expect(routeAfterGrading(state)).toBe('pass');
  });

  it('should return "pass" when feedback is whitespace-only', () => {
    const state = createMockState({
      gradingFeedback: '   ',
      retryCount: 0,
    });
    expect(routeAfterGrading(state)).toBe('pass');
  });
});
