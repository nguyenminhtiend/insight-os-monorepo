# Phase 13: Observability Demo & Verification

## 🎬 Demo Script

Follow this script to demonstrate all Phase 13 features.

---

## Setup (1 min)

### 1. Start the API
```bash
cd apps/api
pnpm dev
```

Wait for:
```
🚀 InsightOS API running on http://localhost:3001
```

### 2. Open Langfuse Dashboard
In your browser, open: https://cloud.langfuse.com

---

## Demo Part 1: Basic Tracing (2 min)

### Test Health Endpoint
```bash
curl http://localhost:3001/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-08T..."
}
```

### Check Metrics Baseline
```bash
curl http://localhost:3001/metrics | jq
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "requests": 1,
    "llmCalls": 0,
    "tokens": { "prompt": 0, "completion": 0 },
    "estimatedCost": "$0.0000",
    "errors": 0,
    "avgLatencyMs": "2.34"
  }
}
```

**✅ Verify:** Request count should be > 0

---

## Demo Part 2: Chat with Tracing (3 min)

### Make a Chat Request
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the key factors in market analysis?",
    "conversationId": "demo-trace-001"
  }'
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "message": "Market analysis typically involves...",
    "conversationId": "demo-trace-001",
    ...
  }
}
```

### Check Updated Metrics
```bash
curl http://localhost:3001/metrics | jq
```

**Expected changes:**
- `requests` increased
- `llmCalls` increased by 1
- `tokens.prompt` > 0
- `tokens.completion` > 0
- `estimatedCost` > "$0.0000"

### View in Langfuse
1. Refresh Langfuse dashboard
2. Look for trace: `POST /chat`
3. Click to see details:
   - Request method and path
   - Response status
   - Duration
   - LLM generation with input/output

**✅ Verify:** Trace appears with full details

---

## Demo Part 3: RAG Query with Tracing (3 min)

### Make a RAG Query
```bash
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tell me about competitive intelligence",
    "topK": 3
  }'
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "answer": "Competitive intelligence refers to...",
    "chunks": [...],
    "cached": false
  }
}
```

### View RAG Trace in Langfuse
1. Refresh dashboard
2. Find trace: `POST /rag/query`
3. Observe:
   - Multiple LLM calls (embedding + generation)
   - Token usage per call
   - Total duration
   - Response status

**✅ Verify:** Multiple generations visible in trace

---

## Demo Part 4: Error Tracing (2 min)

### Trigger an Error
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

**Expected:**
```json
{
  "success": false,
  "error": {
    "message": "...",
    "code": "VALIDATION_ERROR"
  }
}
```

### View Error in Langfuse
1. Refresh dashboard
2. Find the error trace (usually marked in red)
3. Observe error details:
   - Error message
   - Status code: 400 or 500
   - Stack trace (if available)

**✅ Verify:** Error trace includes useful debugging info

---

## Demo Part 5: Metrics Dashboard (2 min)

### Make Multiple Requests
```bash
# Request 1: Chat
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "conversationId": "demo-002"}'

# Request 2: Analysis
curl -X POST http://localhost:3001/analyze/company \
  -H "Content-Type: application/json" \
  -d '{"company": "OpenAI", "analysisType": "overview"}'

# Request 3: RAG
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "market trends", "topK": 3}'
```

### Final Metrics Check
```bash
curl http://localhost:3001/metrics | jq
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "requests": 8,
    "llmCalls": 6,
    "tokens": {
      "prompt": 2500,
      "completion": 5800
    },
    "estimatedCost": "$0.0042",
    "errors": 1,
    "avgLatencyMs": "456.78"
  }
}
```

**✅ Verify:**
- All metrics have realistic values
- Cost calculation is reasonable
- Average latency is measured

---

## Demo Part 6: Langfuse Features (3 min)

### Explore Langfuse Dashboard

#### View All Traces
- Navigate to "Traces" tab
- See chronological list of all requests
- Note timestamps, durations, status codes

#### Drill into a Trace
- Click any trace
- Observe:
  - Full request metadata
  - Nested generations (LLM calls)
  - Token usage per generation
  - Input/output for each step
  - Execution timeline

#### Filter and Search
- Filter by status (success/error)
- Filter by trace name
- Search by content
- Sort by duration or cost

#### Analyze Costs
- View total token usage
- See cost breakdown by model
- Identify expensive operations

**✅ Verify:** All features work as expected

---

## Automated Test (1 min)

### Run Full Test Suite
```bash
cd /Users/messi/Projects/Others/insight-os-monorepo
./test-phase13.sh
```

**Expected output:**
```
🧪 Phase 13: Observability - Langfuse Tracing Tests
==================================================

📡 Checking API health...
✅ API is healthy

1️⃣  Testing Metrics Endpoint
----------------------------
Metrics response:
{
  "success": true,
  "data": { ... }
}

2️⃣  Testing Chat Endpoint with Tracing
--------------------------------------
Chat response:
{
  "success": true,
  "data": { ... }
}

[... more tests ...]

📊 Metrics Summary
------------------
Total requests: 10
LLM calls: 8
Prompt tokens: 3200
Completion tokens: 6400
Estimated cost: $0.0044
Errors: 1
Avg latency: 389.45 ms

✅ Phase 13 Tests Complete!
```

**✅ Verify:** All tests pass with green checkmarks

---

## Verification Checklist

Use this checklist to verify complete implementation:

### Infrastructure
- [x] Langfuse package installed
- [x] Environment variables set
- [x] API builds without errors
- [x] API starts successfully

### Endpoints
- [x] `/metrics` returns current metrics
- [x] All routes are traced automatically
- [x] Traces appear in Langfuse dashboard
- [x] Errors are tracked with details

### Features
- [x] HTTP request tracing works
- [x] LLM calls are logged
- [x] Token usage is tracked
- [x] Costs are calculated
- [x] Latency is measured
- [x] Errors are captured

### Langfuse Integration
- [x] Traces sent to Langfuse Cloud
- [x] Dashboard shows traces in real-time
- [x] Generations visible with input/output
- [x] Token usage displayed
- [x] Cost estimates shown
- [x] Error traces marked clearly

### Documentation
- [x] PHASE_13_COMPLETE.md created
- [x] PHASE_13_QUICKSTART.md created
- [x] PHASE_13_EXAMPLES.md created
- [x] PHASE_13_SUMMARY.md created
- [x] test-phase13.sh created

---

## Troubleshooting

### Traces not appearing?
1. Wait 5-10 seconds (Langfuse has slight delay)
2. Check environment variables: `cat .env | grep LANGFUSE`
3. Verify credentials in Langfuse dashboard
4. Check API logs for errors

### Metrics showing 0?
1. Metrics are in-memory (reset on restart)
2. Make at least one request first
3. Check `/health` then `/metrics`

### Build errors?
1. Run `pnpm install` in `apps/api`
2. Check TypeScript version
3. Clear `dist/` and rebuild

---

## Performance Expectations

### Tracing Overhead
- **Minimal**: < 5ms per request
- **Async**: Traces sent in background
- **No blocking**: API remains responsive

### Metrics Accuracy
- **Request count**: 100% accurate
- **Token usage**: Exact from AI SDK
- **Cost calculation**: Approximate (based on model pricing)
- **Latency**: Measured in milliseconds

---

## Success Metrics

After demo, you should have:

1. ✅ **Working tracing**: All requests traced
2. ✅ **Visible in Langfuse**: Traces appear in dashboard
3. ✅ **Accurate metrics**: Realistic numbers in `/metrics`
4. ✅ **Error tracking**: Errors logged with context
5. ✅ **Cost visibility**: Token usage and costs tracked
6. ✅ **Performance insights**: Latency measured

---

## Next Steps

1. **Integrate with existing features**: Add custom spans to RAG, agents, memory
2. **Add quality scores**: Log evaluation metrics
3. **Create dashboards**: Build custom views in Langfuse
4. **Set up alerts**: Configure notifications for errors/costs
5. **Move to Phase 14**: Implement GraphRAG with Neo4j

---

**Demo Complete! 🎉**

You now have production-grade observability for your InsightOS API. Every request is traced, every LLM call is logged, and you have full visibility into your AI application's behavior, costs, and performance.

Happy observing! 🔍
