import { StateGraph, END, START } from '@langchain/langgraph';
import { ResearchState, type ResearchStateType } from './state.js';
import { plannerNode, replannerNode } from '../nodes/planner.js';
import { executorNode, analyzerNode } from '../nodes/executor.js';
import { reflectorNode, finalizerNode } from '../nodes/reflector.js';

/**
 * Should continue executing plan steps?
 */
function shouldContinueExecution(state: ResearchStateType): 'executor' | 'analyzer' {
  if (state.currentStep < state.plan.length) {
    return 'executor';
  }
  return 'analyzer';
}

/**
 * Should revise or finalize?
 */
function shouldRevise(state: ResearchStateType): 'replanner' | 'finalizer' {
  if (state.shouldRevise) {
    return 'replanner';
  }
  return 'finalizer';
}

/**
 * Create the research workflow graph
 */
export function createResearchGraph() {
  const graph = new StateGraph(ResearchState)
    // Add nodes
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addNode('analyzer', analyzerNode)
    .addNode('reflector', reflectorNode)
    .addNode('replanner', replannerNode)
    .addNode('finalizer', finalizerNode)

    // Define edges
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addConditionalEdges('executor', shouldContinueExecution)
    .addEdge('analyzer', 'reflector')
    .addConditionalEdges('reflector', shouldRevise)
    .addEdge('replanner', 'executor')
    .addEdge('finalizer', END);

  return graph.compile();
}

/**
 * Run research workflow
 */
export async function runResearchWorkflow(query: string): Promise<{
  answer: string;
  confidence: number;
  steps: string[];
  revisions: number;
}> {
  const graph = createResearchGraph();

  const result = await graph.invoke({
    query,
    
  });

  return {
    answer: result.finalAnswer,
    confidence: result.confidence,
    steps: result.plan,
    revisions: result.revisionCount,
  };
}

/**
 * Stream research workflow execution
 */
export async function* streamResearchWorkflow(query: string): AsyncGenerator<{
  node: string;
  state: Partial<ResearchStateType>;
}> {
  const graph = createResearchGraph();

  const stream = await graph.stream({
    query,
  });

  for await (const event of stream) {
    for (const [node, state] of Object.entries(event)) {
      yield { node, state: state as Partial<ResearchStateType> };
    }
  }
}

