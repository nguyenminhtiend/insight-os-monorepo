# Jobs Package

Background job processing with BullMQ for async document processing, scheduled tasks, and workflow queues.

## Features

- **Document Queue**: Handle document ingestion (text, PDF, URL) and embedding generation
- **Workflow Queue**: Process LLM-heavy tasks (research, analysis, memory extraction)
- **Progress Tracking**: Real-time job progress updates (0-100%)
- **Automatic Retries**: Exponential backoff with configurable attempts
- **Priority Queuing**: Higher priority for embedding jobs
- **Graceful Shutdown**: Clean worker termination

## Job Types

### Document Jobs
- `ingest_text` - Process text documents
- `ingest_pdf` - Process PDF files
- `ingest_url` - Scrape and process URLs
- `generate_embeddings` - Generate vector embeddings (priority: 2)

### Workflow Jobs
- `research` - Run research workflows
- `analysis` - Run analysis workflows
- `memory_extract` - Extract and store memories

## Usage

### Queue a Job

```typescript
import { queueDocumentIngestion } from '@insight-os/jobs';

const jobId = await queueDocumentIngestion('ingest_text', {
  name: 'My Document',
  content: 'Document content...',
  options: {}
});
```

### Start Workers

```typescript
import { startAllWorkers } from '@insight-os/jobs';

const { documentWorker, workflowWorker } = startAllWorkers();

// Graceful shutdown
process.on('SIGINT', async () => {
  await documentWorker.close();
  await workflowWorker.close();
});
```

### Check Job Status

```typescript
import { documentQueue } from '@insight-os/jobs';

const job = await documentQueue.getJob(jobId);
const state = await job.getState();
const progress = job.progress; // 0-100
```

## Configuration

### Connection

```typescript
// Default: redis://localhost:6379
// Override with: REDIS_URL env variable
```

### Default Job Options

- **Attempts**: 3 (2 for workflow jobs)
- **Backoff**: Exponential starting at 1000ms
- **History**: Keep 100 completed, 500 failed

### Worker Concurrency

- **Document Worker**: 3 concurrent jobs
- **Workflow Worker**: 2 concurrent jobs (LLM-heavy)

## API Endpoints

- `GET /jobs/status` - Queue statistics
- `POST /jobs/documents` - Queue document job
- `GET /jobs/:queue/:id` - Job status and progress

