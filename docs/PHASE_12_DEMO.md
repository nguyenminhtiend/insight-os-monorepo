# Phase 12 Demo Guide

## Setup (4 terminals needed)

### Terminal 1: Redis
```bash
redis-server
# Should show: Ready to accept connections
```

### Terminal 2: API Server
```bash
cd /Users/messi/Projects/Others/insight-os-monorepo/apps/api
pnpm dev
# Should show: 🚀 InsightOS API running on http://localhost:3001
```

### Terminal 3: Worker
```bash
cd /Users/messi/Projects/Others/insight-os-monorepo/apps/worker
pnpm dev
# Should show: 🚀 Starting InsightOS Worker...
# Should show: [Jobs] Starting workers...
```

### Terminal 4: Test Runner
```bash
cd /Users/messi/Projects/Others/insight-os-monorepo
./test-phase12.sh
```

---

## Demo Flow

### 1. Check Queue Status
```bash
curl http://localhost:3001/jobs/status
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "documents": {
      "waiting": 0,
      "active": 0,
      "completed": 0,
      "failed": 0
    },
    "workflows": {
      "waiting": 0,
      "active": 0,
      "completed": 0,
      "failed": 0
    }
  }
}
```

### 2. Queue Document Ingestion Job
```bash
curl -X POST http://localhost:3001/jobs/documents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ingest_text",
    "payload": {
      "name": "Product Strategy 2024",
      "content": "Our product strategy focuses on AI-first features...",
      "options": {}
    }
  }'
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "jobId": "1",
    "type": "ingest_text"
  }
}
```

**Worker Terminal Should Show:**
```
[DocumentWorker] Processing ingest_text: Product Strategy 2024
[DocumentWorker] Ingesting text: Product Strategy 2024
[DocumentWorker] Completed ingest_text
[DocumentWorker] Job 1 completed
```

### 3. Check Job Status
```bash
curl http://localhost:3001/jobs/documents/1
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "state": "completed",
    "progress": 100,
    "data": {
      "type": "ingest_text",
      "payload": {
        "name": "Product Strategy 2024",
        "content": "..."
      }
    },
    "attemptsMade": 1,
    "failedReason": null
  }
}
```

### 4. Queue Multiple Jobs
```bash
# Queue embedding generation (higher priority)
curl -X POST http://localhost:3001/jobs/documents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "generate_embeddings",
    "payload": {
      "documentId": "doc_123"
    }
  }'

# Queue PDF ingestion
curl -X POST http://localhost:3001/jobs/documents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ingest_pdf",
    "payload": {
      "name": "Annual Report.pdf",
      "url": "https://example.com/report.pdf"
    }
  }'
```

### 5. View Updated Queue Status
```bash
curl http://localhost:3001/jobs/status
```

**Should show jobs being processed:**
```json
{
  "documents": {
    "waiting": 1,
    "active": 1,
    "completed": 1,
    "failed": 0
  }
}
```

---

## Features to Highlight

### ✅ Progress Tracking
Jobs update progress: 0% → 10% → 50% → 100%

### ✅ Priority Queuing
`generate_embeddings` jobs get priority 2 (processed first)

### ✅ Automatic Retries
Failed jobs retry 3 times with exponential backoff (1s, 2s, 4s)

### ✅ Concurrency
- Document worker: 3 concurrent jobs
- Workflow worker: 2 concurrent jobs

### ✅ Graceful Shutdown
`Ctrl+C` in worker terminal completes active jobs before exiting

### ✅ Job History
- Keeps 100 completed jobs
- Keeps 500 failed jobs for debugging

---

## Testing Failed Jobs

To test retry logic:

1. Modify `document-worker.ts` to throw an error:
```typescript
case 'ingest_text':
  throw new Error('Simulated failure');
```

2. Queue a job - it will retry 3 times
3. Check worker logs for retry attempts
4. Job state will be 'failed' after 3 attempts

---

## What's Happening Behind the Scenes

1. **API** receives job request → adds to Redis queue
2. **Worker** picks up job from queue
3. **BullMQ** manages retries, progress, state
4. **Redis** stores job data and state
5. **API** can query job status anytime

---

## Cleanup

Press `Ctrl+C` in each terminal (1-3) to stop services gracefully.

