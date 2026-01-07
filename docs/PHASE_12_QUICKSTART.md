# Phase 12 Quick Start

## 🚀 Start All Services

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: API Server
cd apps/api && pnpm dev

# Terminal 3: Worker
cd apps/worker && pnpm dev

# Terminal 4: Run Test
./test-phase12.sh
```

## 📝 Quick Commands

### Queue a job
```bash
curl -X POST http://localhost:3001/jobs/documents \
  -H "Content-Type: application/json" \
  -d '{"type":"ingest_text","payload":{"name":"Test","content":"Hello"}}'
```

### Check status
```bash
curl http://localhost:3001/jobs/status
```

### Get job details
```bash
curl http://localhost:3001/jobs/documents/1
```

## 🎯 What to Watch

### In Worker Terminal
```
[DocumentWorker] Processing ingest_text: Test
[DocumentWorker] Ingesting text: Test
[DocumentWorker] Completed ingest_text
[DocumentWorker] Job 1 completed
```

### Job States
- `waiting` - In queue
- `active` - Processing
- `completed` - Done ✅
- `failed` - Error (will retry)

## 📊 Architecture

```
API Server          BullMQ/Redis        Worker
    │                   │                 │
    ├──[queue job]─────>│                 │
    │                   │<───[poll]───────┤
    │                   │                 │
    │                   ├──[job data]────>│
    │                   │                 │
    │<──[job status]────┤<──[update]──────┤
```

## ✨ Features

- **Auto Retry**: 3 attempts with exponential backoff
- **Progress**: 0% → 10% → 50% → 100%
- **Priority**: Embeddings processed first
- **Concurrency**: 3 document jobs, 2 workflow jobs
- **Graceful**: Ctrl+C completes active jobs

## 🐛 Troubleshooting

### Worker not processing jobs?
- Check Redis is running: `redis-cli ping` (should return "PONG")
- Check worker logs for connection errors
- Verify REDIS_URL env variable

### Jobs stuck in "waiting"?
- Worker may not be running
- Check queue status: `curl http://localhost:3001/jobs/status`

### Need to clear queues?
```bash
redis-cli
> FLUSHALL  # ⚠️ Clears all Redis data
```

---

For detailed demo, see `docs/PHASE_12_DEMO.md`

