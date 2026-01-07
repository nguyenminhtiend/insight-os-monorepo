import { StateGraph, END, START, interrupt, Command, MemorySaver } from '@langchain/langgraph';
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
// Shared in-memory checkpointer for the server process
const checkpointer = new MemorySaver();

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

  // Compile with shared checkpointer to persist state
  return graph.compile({ checkpointer });
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
    const config = { configurable: { thread_id: activeThreadId } };
    const result = await graph.invoke({ query }, config);

    // Check if the graph execution was interrupted
    const state = await graph.getState(config);
    const interruptTask = state.tasks.find((t) => t.interrupts && t.interrupts.length > 0);

    if (interruptTask) {
      const interruptValue = interruptTask.interrupts[0].value;

      // Type guard for ApprovalInterrupt
      if (isApprovalInterrupt(interruptValue)) {
        return {
          answer: '',
          requiresApproval: true,
          pendingApprovalId: interruptValue.requestId,
          threadId: activeThreadId,
        };
      }
    }

    return {
      answer: result.finalAnswer,
      requiresApproval: false,
      threadId: activeThreadId,
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Interface for the approval interrupt value
 */
interface ApprovalInterrupt {
  type: 'approval_required';
  requestId: string;
  action: string;
  description: string;
}

/**
 * Type guard to check if a value is an ApprovalInterrupt
 */
function isApprovalInterrupt(value: unknown): value is ApprovalInterrupt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as ApprovalInterrupt).type === 'approval_required' &&
    'requestId' in value
  );
}

/**
 * Resume workflow after approval
 */
export async function resumeHITLWorkflow(
  threadId: string,
  approved: boolean,
): Promise<{ answer: string }> {
  const graph = createHITLResearchGraph();

  const result = await graph.invoke(new Command({ resume: { approved } }), {
    configurable: { thread_id: threadId },
  });

  return { answer: result.finalAnswer };
}
