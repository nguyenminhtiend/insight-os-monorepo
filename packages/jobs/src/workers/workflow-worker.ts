import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import type { WorkflowJob } from '../queues/workflow.js';

async function processWorkflowJob(job: Job<WorkflowJob>): Promise<void> {
  const { type, payload } = job.data;

  console.log(`[WorkflowWorker] Processing ${type}`);

  switch (type) {
    case 'research':
      console.log(`[WorkflowWorker] Running research: ${payload.query}`);
      // await runResearchWorkflow(payload.query);
      break;

    case 'analysis':
      console.log(`[WorkflowWorker] Running analysis`);
      break;

    case 'memory_extract':
      console.log(`[WorkflowWorker] Extracting memories for: ${payload.userId}`);
      break;
  }
}

export function startWorkflowWorker(): Worker {
  const worker = new Worker('workflows', processWorkflowJob, {
    connection,
    concurrency: 2, // Lower concurrency for LLM-heavy jobs
  });

  worker.on('completed', (job) => {
    console.log(`[WorkflowWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WorkflowWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

