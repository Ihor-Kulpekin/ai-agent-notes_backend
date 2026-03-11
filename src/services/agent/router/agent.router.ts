import { AgentStateType } from 'src/services/agent/agent.state';

// ==================== ROUTER ====================
export function routeAfterPlan(
  state: AgentStateType,
): 'query_rewriter' | 'generator' | 'tools_caller' {
  if (state.plan === 'search') return 'query_rewriter';
  if (state.plan === 'tools') return 'tools_caller';
  return 'generator';
}
