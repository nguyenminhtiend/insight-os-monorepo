import { StateGraph, END, START, interrupt } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ResearchState, type ResearchStateType } from './state.js';
import { plannerNode, replannerNode } from '../nodes/planner.js';
import { executorNode, analyzerNode } from '../nodes/executor.js';
import { reflectorNode, finalizerNode } from '../nodes/reflector.js';
import { requestApproval, needsApproval, waitForApproval } from '../hitl/approval.js';
import { saveCheckpoint, loadCheckpoint } from '../hitl/checkpoint.js';

/**
 * Approval gate node - pauses for human approval when needed
 */
export async function approvalGateNode(
  state: ResearchStateType,
  config?: RunnableConfig,
): Promise<Partial<ResearchStateType>> {
  const currentStep = state.plan[state.currentStep];
  const threadId = config?.configurable?.thread_id || state.query;

  // Check if this step needs approval
  if (needsApproval(currentStep, 'medium')) {
    console.log('[ApprovalGate] Requesting approval for:', currentStep);

    const request = await requestApproval(
      threadId, // workflowId
      currentStep,
      `Execute research step: ${currentStep}`,
      { step: state.currentStep, query: state.query },
      'medium',
    );

    // Use LangGraph interrupt for human-in-the-loop
    const approval = interrupt({
      type: 'approval_required',
      requestId: request.id,
      action: currentStep,
      description: request.description,
    });

    // After interrupt resumes, check approval status
    if (!approval?.approved) {
      return {
        shouldRevise: false,
        finalAnswer: 'Workflow cancelled by user.',
      };
    }
  }

  return {};
}

/**
 * Checkpoint node - saves state before risky operations
 */
export async function checkpointNode(
  state: ResearchStateType,
  config?: RunnableConfig,
): Promise<Partial<ResearchStateType>> {
  const threadId = config?.configurable?.thread_id || state.query;

  await saveCheckpoint(threadId, 'checkpoint', {
    ...state,
  });

  return {};
}

/**
 * Create HITL-enabled research graph
 */
/**
 * Run HITL workflow with approval handling
 */
export function createHITLResearchGraph() {
  const graph = new StateGraph(ResearchState)
    .addNode('planner', plannerNode)
    .addNode('checkpoint', checkpointNode)
    .addNode('approval_gate', approvalGateNode)
    .addNode('executor', executorNode)
    .addNode('analyzer', analyzerNode)
    .addNode('reflector', reflectorNode)
    .addNode('replanner', replannerNode)
    .addNode('finalizer', finalizerNode)

    .addEdge(START, 'planner')
    .addEdge('planner', 'checkpoint')
    .addEdge('checkpoint', 'approval_gate')
    .addEdge('approval_gate', 'executor')
    .addConditionalEdges('executor', (state) =>
      state.currentStep < state.plan.length ? 'approval_gate' : 'analyzer',
    )
    .addEdge('analyzer', 'reflector')
    .addConditionalEdges('reflector', (state) => (state.shouldRevise ? 'replanner' : 'finalizer'))
    .addEdge('replanner', 'checkpoint')
    .addEdge('finalizer', END);

  // Compile without checkpointer for now (would need MemorySaver or similar)
  return graph.compile();
}

/**
 * Run HITL workflow with approval handling
 */
export async function runHITLWorkflow(
  query: string,
  threadId?: string,
): Promise<{
  answer: string;
  requiresApproval: boolean;
  pendingApprovalId?: string;
  threadId: string;
}> {
  const graph = createHITLResearchGraph();

  // Generate a unique thread ID if one isn't provided
  const activeThreadId = threadId || `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const result = await graph.invoke({ query }, { configurable: { thread_id: activeThreadId } });

    return {
      answer: result.finalAnswer,
      requiresApproval: false,
      threadId: activeThreadId,
    };
  } catch (error: any) {
    if (error.type === 'interrupt') {
      return {
        answer: '',
        requiresApproval: true,
        pendingApprovalId: error.value?.requestId,
        threadId: activeThreadId,
      };
    }
    throw error;
  }
}

/**
 * Resume workflow after approval
 */
export async function resumeHITLWorkflow(
  query: string,
  threadId: string,
  approved: boolean,
): Promise<{ answer: string }> {
  const graph = createHITLResearchGraph();

  const result = await graph.invoke(
    null, // No new input, resume from checkpoint
    {
      configurable: { thread_id: threadId },
    },
  );

  return { answer: result.finalAnswer };
}
