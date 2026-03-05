import { StateGraph, END, START } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { createAgentTools } from './agent.tools';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { AgentState } from 'src/services/agent/agent.state';
import { createPlannerNode } from 'src/services/agent/nodes/planner.node';
import { createSearchNode } from 'src/services/agent/nodes/search.node';
import { createGeneratorNode } from 'src/services/agent/nodes/generator.node';
import { createToolsCallerNode } from 'src/services/agent/nodes/tools-caller.node';
import { createToolsResultNode } from 'src/services/agent/nodes/tools-result.node';
import { routeAfterPlan } from 'src/services/agent/router/agent.router';

// ==================== BUILD GRAPH ====================

export function buildAgentGraph(
  llm: ChatOpenAI,
  vectorStore: VectorStoreService,
) {
  // Створюємо tools
  const tools = createAgentTools(llm, vectorStore);

  // LLM з прив'язаними tools — він знає які tools доступні
  const llmWithTools = llm.bindTools(tools);

  // ToolNode — автоматично виконує tool який обрав LLM
  const toolNode = new ToolNode(tools);

  const graph = new StateGraph(AgentState)
    // Вершини
    .addNode('planner', createPlannerNode(llm))
    .addNode('search', createSearchNode(vectorStore))
    .addNode('generator', createGeneratorNode(llm))
    .addNode('tools_caller', createToolsCallerNode(llmWithTools))
    .addNode('tools_executor', toolNode)
    .addNode('tools_result', createToolsResultNode(llm))

    // Ребра
    .addEdge(START, 'planner')

    .addConditionalEdges('planner', routeAfterPlan, {
      search: 'search',
      generator: 'generator',
      tools_caller: 'tools_caller',
    })

    .addEdge('search', 'generator')
    .addEdge('generator', END)

    // Tools flow: caller → executor → result → END
    .addEdge('tools_caller', 'tools_executor')
    .addEdge('tools_executor', 'tools_result')
    .addEdge('tools_result', END);

  return graph.compile();
}
