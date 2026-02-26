import { AgentStateType } from 'src/services/agent/agent.state';

// ==================== ROUTER ====================
export function routeAfterPlan(
  state: AgentStateType,
): 'search' | 'generator' | 'tools_caller' {
  if (state.plan === 'search') return 'search';
  if (state.plan === 'tools') return 'tools_caller';
  return 'generator';
}
