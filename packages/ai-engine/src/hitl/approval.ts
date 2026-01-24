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
  const normalizedAction = action.toLowerCase();

  // High risk: Financial, Communication, Destruction -> Always requires approval
  const highRiskKeywords = [
    'delete',
    'destroy',
    'remove', // Destruction
    'publish',
    'post',
    'broadcast', // Public facing
    'send',
    'email',
    'message', // Communication
    'buy',
    'purchase',
    'pay',
    'transfer', // Financial
    'AI'
  ];

  // Medium risk: Mutation, External interaction -> Requires approval (unless manually set to low risk)
  const mediumRiskKeywords = [
    'update',
    'modify',
    'change',
    'edit', // Mutation
    'upload',
    'download',
    'register',
    'sign up',
    'login',
    'auth', // Identity
    'api',
    'request',
    'fetch' // External Data
  ];

  if (highRiskKeywords.some((keyword) => normalizedAction.includes(keyword))) return true;
  if (riskLevel === 'high') return true;
  if (
    mediumRiskKeywords.some((keyword) => normalizedAction.includes(keyword)) &&
    riskLevel !== 'low'
  )
    return true;

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
