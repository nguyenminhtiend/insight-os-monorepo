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
    concurrency: 3
  });

  worker.on('completed', (job) => {
    console.log(`[DocumentWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[DocumentWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
