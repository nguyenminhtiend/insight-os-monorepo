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

