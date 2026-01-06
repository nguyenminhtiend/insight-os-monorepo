export interface Checkpoint {
  id: string;
  workflowId: string;
  nodeName: string;
  state: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

const CHECKPOINT_TTL = 86400000; // 24 hours in ms

// In-memory store (use Redis/DB in production via API)
const checkpoints = new Map<string, Checkpoint>();

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
    expiresAt: new Date(Date.now() + CHECKPOINT_TTL)
  };

  checkpoints.set(workflowId, checkpoint);

  console.log(`[Checkpoint] Saved: ${workflowId} at ${nodeName}`);
  return checkpoint;
}

/**
 * Load workflow checkpoint
 */
export async function loadCheckpoint(workflowId: string): Promise<Checkpoint | null> {
  const checkpoint = checkpoints.get(workflowId);

  if (checkpoint) {
    // Check if expired
    if (checkpoint.expiresAt < new Date()) {
      checkpoints.delete(workflowId);
      return null;
    }
    console.log(`[Checkpoint] Loaded: ${workflowId} at ${checkpoint.nodeName}`);
  }

  return checkpoint || null;
}

/**
 * Delete checkpoint after workflow completion
 */
export async function deleteCheckpoint(workflowId: string): Promise<void> {
  checkpoints.delete(workflowId);
  console.log(`[Checkpoint] Deleted: ${workflowId}`);
}

/**
 * List all active checkpoints
 */
export async function listCheckpoints(): Promise<string[]> {
  const now = new Date();
  const active: string[] = [];

  for (const [workflowId, checkpoint] of checkpoints.entries()) {
    if (checkpoint.expiresAt > now) {
      active.push(workflowId);
    } else {
      // Clean up expired
      checkpoints.delete(workflowId);
    }
  }

  return active;
}

