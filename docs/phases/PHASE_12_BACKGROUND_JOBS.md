# Phase 12: Background Jobs - BullMQ

> **Goal:** Implement background job processing with BullMQ for async document processing, scheduled tasks, and workflow queues.

---

## Prerequisites

- Phase 11 completed (memory system)
- Redis configured

---

## Implementation Steps

### Step 1: Create Jobs Package

**1.1 Create `packages/jobs/package.json`:**

```json
{
  "name": "@insight-os/jobs",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./queues": "./src/queues/index.ts",
    "./workers": "./src/workers/index.ts"
  },
  "dependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.4.2",
    "@insight-os/db-schema": "workspace:*"
  }
}
```

**1.2 Create `packages/jobs/src/connection.ts`:**

```typescript
import { Redis } from 'ioredis';

export const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  { maxRetriesPerRequest: null }
);

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};
```

**1.3 Create `packages/jobs/src/queues/document.ts`:**

```typescript
import { Queue } from 'bullmq';
import { connection, defaultJobOptions } from '../connection.js';

export interface DocumentJob {
  type: 'ingest_text' | 'ingest_pdf' | 'ingest_url' | 'generate_embeddings';
  payload: {
    documentId?: string;
    name?: string;
    content?: string;
    url?: string;
    options?: Record<string, unknown>;
  };
}

export const documentQueue = new Queue<DocumentJob>('documents', {
  connection,
  defaultJobOptions,
});

export async function queueDocumentIngestion(
  type: DocumentJob['type'],
  payload: DocumentJob['payload']
): Promise<string> {
  const job = await documentQueue.add(type, { type, payload }, {
    priority: type === 'generate_embeddings' ? 2 : 1,
  });
  return job.id!;
}
```

**1.4 Create `packages/jobs/src/queues/workflow.ts`:**

```typescript
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
```

**1.5 Create `packages/jobs/src/workers/document-worker.ts`:**

```typescript
import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import type { DocumentJob } from '../queues/document.js';

async function processDocumentJob(job: Job<DocumentJob>): Promise<void> {
  const { type, payload } = job.data;

  console.log(`[DocumentWorker] Processing ${type}:`, payload.name || payload.documentId);

  await job.updateProgress(10);

  switch (type) {
    case 'ingest_text':
      // Call ingestion service
      console.log(`[DocumentWorker] Ingesting text: ${payload.name}`);
      await job.updateProgress(50);
      // await ingestText(payload.content, payload.name, payload.options);
      break;

    case 'ingest_pdf':
      console.log(`[DocumentWorker] Ingesting PDF: ${payload.name}`);
      await job.updateProgress(50);
      break;

    case 'ingest_url':
      console.log(`[DocumentWorker] Ingesting URL: ${payload.url}`);
      await job.updateProgress(50);
      break;

    case 'generate_embeddings':
      console.log(`[DocumentWorker] Generating embeddings for: ${payload.documentId}`);
      await job.updateProgress(50);
      break;
  }

  await job.updateProgress(100);
  console.log(`[DocumentWorker] Completed ${type}`);
}

export function startDocumentWorker(): Worker {
  const worker = new Worker('documents', processDocumentJob, {
    connection,
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    console.log(`[DocumentWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[DocumentWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
```

**1.6 Create `packages/jobs/src/workers/workflow-worker.ts`:**

```typescript
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
```

**1.7 Create `packages/jobs/src/index.ts`:**

```typescript
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

  return { documentWorker, workflowWorker };
}
```

### Step 2: Add Jobs API Routes

**2.1 Create `apps/api/src/routes/jobs.ts`:**

```typescript
import { Hono } from 'hono';
import {
  documentQueue,
  workflowQueue,
  queueDocumentIngestion,
  queueWorkflow,
} from '@insight-os/jobs';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const jobsRoutes = new Hono();

/**
 * GET /jobs/status
 * Get queue status
 */
jobsRoutes.get('/status', async (c) => {
  const [docCounts, workflowCounts] = await Promise.all([
    documentQueue.getJobCounts(),
    workflowQueue.getJobCounts(),
  ]);

  return c.json(createResponse({
    documents: docCounts,
    workflows: workflowCounts,
  }));
});

/**
 * POST /jobs/documents
 * Queue document processing job
 */
jobsRoutes.post('/documents', async (c) => {
  try {
    const { type, payload } = await c.req.json<{
      type: 'ingest_text' | 'ingest_pdf' | 'ingest_url' | 'generate_embeddings';
      payload: Record<string, unknown>;
    }>();

    const jobId = await queueDocumentIngestion(type, payload);
    return c.json(createResponse({ jobId, type }), 202);
  } catch (error) {
    return c.json(createErrorResponse('Failed to queue job'), 500);
  }
});

/**
 * GET /jobs/:id
 * Get job status
 */
jobsRoutes.get('/:queue/:id', async (c) => {
  const queue = c.req.param('queue');
  const id = c.req.param('id');

  const q = queue === 'documents' ? documentQueue : workflowQueue;
  const job = await q.getJob(id);

  if (!job) {
    return c.json(createErrorResponse('Job not found'), 404);
  }

  const state = await job.getState();
  const progress = job.progress;

  return c.json(createResponse({
    id: job.id,
    state,
    progress,
    data: job.data,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
  }));
});
```

### Step 3: Create Worker Entry Point

**3.1 Create `apps/worker/package.json`:**

```json
{
  "name": "@insight-os/worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@insight-os/jobs": "workspace:*",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

**3.2 Create `apps/worker/src/index.ts`:**

```typescript
import 'dotenv/config';
import { startAllWorkers } from '@insight-os/jobs';

console.log('🚀 Starting InsightOS Worker...');

const workers = startAllWorkers();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down workers...');
  await Promise.all([
    workers.documentWorker.close(),
    workers.workflowWorker.close(),
  ]);
  process.exit(0);
});
```

---

## Demo Checklist

- [ ] Queue document ingestion job
- [ ] Queue workflow job
- [ ] View job status
- [ ] Worker processes jobs
- [ ] Job progress tracking
- [ ] Failed job handling

---

## What's Next

**Phase 13: Observability** will add:
- Langfuse tracing integration
- Metrics collection
- Cost tracking

