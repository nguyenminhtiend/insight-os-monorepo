export * from './queues/document.js';
export * from './queues/workflow.js';
export * from './workers/document-worker.js';
export * from './workers/workflow-worker.js';

import { startDocumentWorker } from './workers/document-worker.js';
import { startWorkflowWorker } from './workers/workflow-worker.js';

export function startAllWorkers() {
  console.log('[Jobs] Starting workers...');
  const documentWorker = startDocumentWorker();
  const workflowWorker = startWorkflowWorker();
  console.log('[Jobs] Started workers...');
  return { documentWorker, workflowWorker };
}
