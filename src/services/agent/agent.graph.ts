import { StateGraph, END, START } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { createAgentTools } from './agent.tools';
import { VectorStoreService } from 'src/services/vector-store/vector-store.service';
import { AgentState } from 'src/services/agent/agent.state';
import { createPlannerNode } from 'src/services/agent/nodes/planner.node';
import { createSearchNode } from 'src/services/agent/nodes/search.node';
import { createGeneratorNode } from 'src/services/agent/nodes/generator.node';
import { createToolsCallerNode } from 'src/services/agent/nodes/tools-caller.node';
import { createToolsResultNode } from 'src/services/agent/nodes/tools-result.node';
import { createRelevanceNode } from 'src/services/agent/nodes/relevance.node';
import { createGraderNode } from 'src/services/agent/nodes/grader.node';
import { createQueryRewriterNode } from 'src/services/agent/nodes/query-rewriter.node';
import { routeAfterPlan } from 'src/services/agent/router/agent.router';
import { routeAfterGrading } from 'src/services/agent/router/grader.router';

// ==================== BUILD GRAPH ====================

export function buildAgentGraph(
  llmRaw: ChatOpenAI,
  llmWithFallbacks: BaseChatModel,
  vectorStore: VectorStoreService,
  checkpointer: BaseCheckpointSaver,
  fastLlm?: ChatOpenAI,
) {
  // fastLlm: for classification tasks (planner, grader, tools_result)
  // if not provided — falls back to primary llm
  const classifierLlm = fastLlm ?? llmRaw;

  const tools = createAgentTools(llmRaw, vectorStore);

  // 1. В'яжемо інструменти до ОБИДВОХ сирих моделей
  const primaryWithTools = llmRaw.bindTools(tools);

  // Якщо fastLlm не передано, використовуємо llmRaw як єдиний варіант
  const backupWithTools = fastLlm ? fastLlm.bindTools(tools) : primaryWithTools;

  // 2. Об'єднуємо їх у єдиний стійкий Runnable (Bind First, Fallback Second)
  const llmWithToolsAndFallbacks = primaryWithTools.withFallbacks({
    fallbacks: [backupWithTools],
  });

  const toolNode = new ToolNode(tools);

  const graph = new StateGraph(AgentState)
    // ── Вершини ──
    .addNode('planner', createPlannerNode(classifierLlm)) // fast: classification
    .addNode('query_rewriter', createQueryRewriterNode(classifierLlm)) // fast model suits here
    .addNode('search', createSearchNode(vectorStore))
    .addNode('relevance_check', createRelevanceNode())
    .addNode('generator', createGeneratorNode(llmWithFallbacks)) // primary: quality matters
    .addNode('grader', createGraderNode(classifierLlm)) // fast: classification
    .addNode('tools_caller', createToolsCallerNode(llmWithToolsAndFallbacks))
    .addNode('tools_executor', toolNode)
    .addNode('tools_result', createToolsResultNode(classifierLlm as any)) // fast

    // ── Ребра ──
    .addEdge(START, 'planner')

    .addConditionalEdges('planner', routeAfterPlan, {
      query_rewriter: 'query_rewriter',
      generator: 'generator',
      tools_caller: 'tools_caller',
    })

    // RAG path: query_rewriter → search → relevance_check → generator → grader → END|retry
    .addEdge('query_rewriter', 'search')
    .addEdge('search', 'relevance_check')
    .addEdge('relevance_check', 'generator')
    .addConditionalEdges('grader', routeAfterGrading, {
      pass: END,
      retry: 'generator',
    })

    // Direct path: generator → grader
    .addEdge('generator', 'grader')

    // Tools path: caller → executor → result → END
    .addEdge('tools_caller', 'tools_executor')
    .addEdge('tools_executor', 'tools_result')
    .addEdge('tools_result', END);

  return graph.compile({
    checkpointer,
    // Human-in-the-Loop: зупинка ПЕРЕД виконанням tools.
    // Граф pause-ується, клієнт отримує { status: 'pending_approval', pendingAction: {...} }.
    // Клієнт повинен підтвердити через POST /chat/resume або відхилити через POST /chat/reject.
    interruptBefore: ['tools_executor'],
  });
}
