import { Queue } from 'bullmq';
import { connection, defaultJobOptions } from '../connection.js';

export interface WorkflowJob {
  type: 'research' | 'analysis' | 'memory_extract';
  payload: {
    query?: string;
    userId?: string;
    conversationId?: string;
    options?: Record<string, unknown>;
  };
}

export const workflowQueue = new Queue<WorkflowJob>('workflows', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2, // Fewer retries for LLM jobs
  },
});

export async function queueWorkflow(
  type: WorkflowJob['type'],
  payload: WorkflowJob['payload']
): Promise<string> {
  const job = await workflowQueue.add(type, { type, payload });
  return job.id!;
}

