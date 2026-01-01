# Phase 10: Human-in-the-Loop

> **Goal:** Add approval gates for risky actions, checkpoint/resume functionality, and human feedback integration.

---

## Prerequisites

- Phase 9 completed (agent workflows with reflection)

---

## Key Concepts

| Concept        | Purpose                                       |
| -------------- | --------------------------------------------- |
| Approval Gates | Pause for human approval on sensitive actions |
| Checkpoints    | Save state for resume after interruption      |
| Feedback Loop  | Incorporate human corrections                 |

---

## Implementation Steps

### Step 1: Create Approval System

**1.1 Create `packages/ai-engine/src/hitl/approval.ts`:**

```typescript
import { db } from '@insight-os/db-schema';

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  action: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  feedback?: string;
}

// In-memory store (use DB in production)
const approvalRequests = new Map<string, ApprovalRequest>();

/**
 * Request human approval for an action
 */
export async function requestApproval(
  workflowId: string,
  action: string,
  description: string,
  payload: Record<string, unknown>,
  riskLevel: 'low' | 'medium' | 'high' = 'medium'
): Promise<ApprovalRequest> {
  const request: ApprovalRequest = {
    id: `apr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    workflowId,
    action,
    description,
    riskLevel,
    payload,
    status: 'pending',
    createdAt: new Date()
  };

  approvalRequests.set(request.id, request);
  console.log(`[HITL] Approval requested: ${request.id} - ${action}`);

  return request;
}

/**
 * Check if approval is needed based on action and risk
 */
export function needsApproval(action: string, riskLevel: 'low' | 'medium' | 'high'): boolean {
  // Define which actions need approval
  const highRiskActions = ['delete', 'publish', 'send_email', 'make_purchase'];
  const mediumRiskActions = ['update', 'external_api_call'];

  if (highRiskActions.includes(action)) return true;
  if (riskLevel === 'high') return true;
  if (mediumRiskActions.includes(action) && riskLevel !== 'low') return true;

  return false;
}

/**
 * Resolve an approval request
 */
export async function resolveApproval(
  requestId: string,
  approved: boolean,
  resolvedBy: string,
  feedback?: string
): Promise<ApprovalRequest | null> {
  const request = approvalRequests.get(requestId);
  if (!request) return null;

  request.status = approved ? 'approved' : 'rejected';
  request.resolvedAt = new Date();
  request.resolvedBy = resolvedBy;
  request.feedback = feedback;

  approvalRequests.set(requestId, request);
  console.log(`[HITL] Approval resolved: ${requestId} - ${request.status}`);

  return request;
}

/**
 * Get pending approvals for a workflow
 */
export function getPendingApprovals(workflowId?: string): ApprovalRequest[] {
  const pending = Array.from(approvalRequests.values()).filter((r) => r.status === 'pending');

  if (workflowId) {
    return pending.filter((r) => r.workflowId === workflowId);
  }

  return pending;
}

/**
 * Wait for approval (with timeout)
 */
export async function waitForApproval(
  requestId: string,
  timeoutMs: number = 300000 // 5 minutes
): Promise<ApprovalRequest> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const request = approvalRequests.get(requestId);
    if (request && request.status !== 'pending') {
      return request;
    }

    // Poll every second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Approval timeout for request ${requestId}`);
}
```

### Step 2: Create Checkpoint System

**2.1 Create `packages/ai-engine/src/hitl/checkpoint.ts`:**

```typescript
import { cacheHelpers } from '../../../apps/api/src/lib/redis.js';

export interface Checkpoint {
  id: string;
  workflowId: string;
  nodeName: string;
  state: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

const CHECKPOINT_PREFIX = 'checkpoint:';
const CHECKPOINT_TTL = 86400; // 24 hours

/**
 * Save workflow checkpoint
 */
export async function saveCheckpoint(
  workflowId: string,
  nodeName: string,
  state: Record<string, unknown>
): Promise<Checkpoint> {
  const checkpoint: Checkpoint = {
    id: `chk_${Date.now()}`,
    workflowId,
    nodeName,
    state,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + CHECKPOINT_TTL * 1000)
  };

  await cacheHelpers.set(`${CHECKPOINT_PREFIX}${workflowId}`, checkpoint, CHECKPOINT_TTL);

  console.log(`[Checkpoint] Saved: ${workflowId} at ${nodeName}`);
  return checkpoint;
}

/**
 * Load workflow checkpoint
 */
export async function loadCheckpoint(workflowId: string): Promise<Checkpoint | null> {
  const checkpoint = await cacheHelpers.get<Checkpoint>(`${CHECKPOINT_PREFIX}${workflowId}`);

  if (checkpoint) {
    console.log(`[Checkpoint] Loaded: ${workflowId} at ${checkpoint.nodeName}`);
  }

  return checkpoint;
}

/**
 * Delete checkpoint after workflow completion
 */
export async function deleteCheckpoint(workflowId: string): Promise<void> {
  await cacheHelpers.delete(`${CHECKPOINT_PREFIX}${workflowId}`);
  console.log(`[Checkpoint] Deleted: ${workflowId}`);
}

/**
 * List all active checkpoints
 */
export async function listCheckpoints(): Promise<string[]> {
  // Implementation depends on Redis SCAN
  return [];
}
```

### Step 3: Create HITL-Enabled Workflow

**3.1 Create `packages/ai-engine/src/graphs/hitl-research-graph.ts`:**

```typescript
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

  return graph.compile({
    checkpointer: true, // Enable built-in checkpointing
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
      configurable: { thread_id: threadId },
      // Pass approval decision
      interruptData: { approved }
    }
  );

  return { answer: result.finalAnswer };
}
```

### Step 4: Add HITL API Routes

**4.1 Update `apps/api/src/routes/agents.ts`:**

```typescript
import { getPendingApprovals, resolveApproval } from '@insight-os/ai-engine/hitl';
import { runHITLWorkflow, resumeHITLWorkflow } from '@insight-os/ai-engine/graphs';

/**
 * GET /agents/approvals
 * List pending approval requests
 */
agentsRoutes.get('/approvals', (c) => {
  const workflowId = c.req.query('workflowId');
  const approvals = getPendingApprovals(workflowId);
  return c.json(createResponse({ approvals }));
});

/**
 * POST /agents/approvals/:id/resolve
 * Approve or reject a pending request
 */
agentsRoutes.post('/approvals/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const { approved, feedback } = await c.req.json<{
      approved: boolean;
      feedback?: string;
    }>();

    const result = await resolveApproval(id, approved, 'user', feedback);

    if (!result) {
      return c.json(createErrorResponse('Approval request not found'), 404);
    }

    return c.json(createResponse(result));
  } catch (error) {
    return c.json(createErrorResponse('Failed to resolve approval'), 500);
  }
});

/**
 * POST /agents/workflow/hitl
 * Run workflow with human-in-the-loop
 */
agentsRoutes.post('/workflow/hitl', async (c) => {
  try {
    const { query, threadId } = await c.req.json<{
      query: string;
      threadId?: string;
    }>();

    const result = await runHITLWorkflow(query, threadId);
    return c.json(createResponse(result));
  } catch (error) {
    console.error('HITL workflow error:', error);
    return c.json(createErrorResponse('Workflow failed'), 500);
  }
});

/**
 * POST /agents/workflow/hitl/resume
 * Resume workflow after approval
 */
agentsRoutes.post('/workflow/hitl/resume', async (c) => {
  try {
    const { threadId, approved } = await c.req.json<{
      threadId: string;
      approved: boolean;
    }>();

    const result = await resumeHITLWorkflow('', threadId, approved);
    return c.json(createResponse(result));
  } catch (error) {
    return c.json(createErrorResponse('Resume failed'), 500);
  }
});
```

---

## Demo Checklist

- [ ] Workflow pauses for approval on sensitive actions
- [ ] Pending approvals can be listed
- [ ] Approvals can be approved/rejected
- [ ] Workflow resumes after approval
- [ ] Checkpoints save workflow state
- [ ] Rejected workflows handle gracefully

---

## API Testing

```bash
# Start HITL workflow
curl -X POST http://localhost:3001/agents/workflow/hitl \
  -H "Content-Type: application/json" \
  -d '{"query": "Analyze Tesla and recommend action", "threadId": "thread-1"}'

# List pending approvals
curl http://localhost:3001/agents/approvals

# Approve request
curl -X POST http://localhost:3001/agents/approvals/apr_xxx/resolve \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "feedback": "Proceed with analysis"}'

# Resume workflow
curl -X POST http://localhost:3001/agents/workflow/hitl/resume \
  -H "Content-Type: application/json" \
  -d '{"threadId": "thread-1", "approved": true}'
```

---

## What's Next

**Phase 11: Memory System** will add:

- Multi-tier memory (buffer/session/long-term)
- Conversation memory
- Knowledge persistence
