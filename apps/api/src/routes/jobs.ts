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

