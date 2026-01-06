import { StateGraph, END, START, interrupt } from '@langchain/langgraph';
import { ResearchState, type ResearchStateType } from './state.js';
import { plannerNode, replannerNode } from '../nodes/planner.js';
import { executorNode, analyzerNode } from '../nodes/executor.js';
import { reflectorNode, finalizerNode } from '../nodes/reflector.js';
import { requestApproval, needsApproval, waitForApproval } from '../hitl/approval.js';
import { saveCheckpoint, loadCheckpoint } from '../hitl/checkpoint.js';

/**
 * Approval gate node - pauses for human approval when needed
 */
async function approvalGateNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  const currentStep = state.plan[state.currentStep];

  // Check if this step needs approval
  if (needsApproval(currentStep, 'medium')) {
    console.log('[ApprovalGate] Requesting approval for:', currentStep);

    const request = await requestApproval(
      state.query, // workflowId
      currentStep,
      `Execute research step: ${currentStep}`,
      { step: state.currentStep, query: state.query },
      'medium'
    );

    // Use LangGraph interrupt for human-in-the-loop
    const approval = interrupt({
      type: 'approval_required',
      requestId: request.id,
      action: currentStep,
      description: request.description
    });

    // After interrupt resumes, check approval status
    if (!approval?.approved) {
      return {
        shouldRevise: false,
        finalAnswer: 'Workflow cancelled by user.'
      };
    }
  }

  return {};
}

/**
 * Checkpoint node - saves state before risky operations
 */
async function checkpointNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  await saveCheckpoint(state.query, 'checkpoint', {
    ...state
  });

  return {};
}

/**
 * Create HITL-enabled research graph
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
      state.currentStep < state.plan.length ? 'approval_gate' : 'analyzer'
    )
    .addEdge('analyzer', 'reflector')
    .addConditionalEdges('reflector', (state) => (state.shouldRevise ? 'replanner' : 'finalizer'))
    .addEdge('replanner', 'checkpoint')
    .addEdge('finalizer', END);

  // Compile without checkpointer for now (would need MemorySaver or similar)
  return graph.compile({
    interruptBefore: ['approval_gate'] // Interrupt before approval
  });
}

/**
 * Run HITL workflow with approval handling
 */
export async function runHITLWorkflow(
  query: string,
  threadId?: string
): Promise<{
  answer: string;
  requiresApproval: boolean;
  pendingApprovalId?: string;
}> {
  const graph = createHITLResearchGraph();

  try {
    const result = await graph.invoke(
      { query },
      { configurable: { thread_id: threadId || query } }
    );

    return {
      answer: result.finalAnswer,
      requiresApproval: false
    };
  } catch (error: any) {
    if (error.type === 'interrupt') {
      return {
        answer: '',
        requiresApproval: true,
        pendingApprovalId: error.value?.requestId
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
  approved: boolean
): Promise<{ answer: string }> {
  const graph = createHITLResearchGraph();

  const result = await graph.invoke(
    null, // No new input, resume from checkpoint
    {
      configurable: { thread_id: threadId }
    }
  );

  return { answer: result.finalAnswer };
}

