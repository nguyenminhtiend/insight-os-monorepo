# InsightOS Worker

Background job processor for document ingestion and workflows.

## Quick Start

### Prerequisites
- Redis running on localhost:6379 (or set REDIS_URL)
- API server running (for job queuing)

### Development

```bash
pnpm dev
```

### Production

```bash
pnpm start
```

## What It Does

The worker listens to BullMQ queues and processes jobs:

### Document Queue
- Processes document ingestion jobs
- Generates embeddings
- Handles PDF parsing and URL scraping
- Concurrency: 3 jobs

### Workflow Queue
- Runs research workflows
- Performs analysis tasks
- Extracts memories
- Concurrency: 2 jobs (LLM-heavy)

## Monitoring

Watch worker logs for:
- `[DocumentWorker]` - Document processing
- `[WorkflowWorker]` - Workflow execution
- Job completion and failure events

## Graceful Shutdown

Press `Ctrl+C` to gracefully shut down workers:
- Completes in-progress jobs
- Closes Redis connections
- Exits cleanly

