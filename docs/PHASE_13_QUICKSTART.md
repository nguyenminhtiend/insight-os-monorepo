# Phase 13: Observability - Quick Start Guide

## 🚀 Start the API

```bash
cd apps/api
pnpm dev
```

The API will start on `http://localhost:3001` with Langfuse tracing enabled.

---

## 🧪 Run Tests

```bash
# From project root
./test-phase13.sh
```

This will:
1. Test the metrics endpoint
2. Make traced API calls
3. Verify traces are being recorded
4. Show metrics summary

---

## 📊 View Traces in Langfuse

1. Open https://cloud.langfuse.com
2. Login with your account
3. Navigate to your project
4. View traces in real-time!

---

## 🔍 Check Metrics

```bash
curl http://localhost:3001/metrics | jq
```

Response:
```json
{
  "success": true,
  "data": {
    "requests": 10,
    "llmCalls": 5,
    "tokens": {
      "prompt": 500,
      "completion": 1200
    },
    "estimatedCost": "$0.0011",
    "errors": 0,
    "avgLatencyMs": "245.32"
  }
}
```

---

## 💬 Test Chat with Tracing

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is market analysis?",
    "conversationId": "test-123"
  }'
```

Then check Langfuse to see the full trace!

---

## 🎯 Test RAG with Tracing

```bash
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tell me about competitive analysis",
    "topK": 3
  }'
```

---

## 📈 Monitor Performance

Watch metrics in real-time:
```bash
watch -n 2 'curl -s http://localhost:3001/metrics | jq'
```

---

## 🐛 Debug with Traces

1. Make a request to any endpoint
2. Copy the trace ID from logs (if available)
3. Search in Langfuse by trace ID
4. View full execution flow with:
   - Input/output for each step
   - Token usage per LLM call
   - Latency breakdown
   - Error details

---

## ✅ What's Traced

Every request through your API is now traced:
- ✅ Chat endpoints (`/chat`, `/chat/stream`)
- ✅ Analysis endpoints (`/analyze/*`)
- ✅ RAG endpoints (`/rag/*`)
- ✅ Agent endpoints (`/agents/*`)
- ✅ Memory endpoints (`/memory/*`)
- ✅ Job endpoints (`/jobs/*`)

---

## 🔧 Troubleshooting

### Traces not appearing in Langfuse?

1. Check environment variables:
```bash
cat .env | grep LANGFUSE
```

2. Verify credentials in Langfuse dashboard

3. Check API logs for Langfuse errors

4. Traces can take 5-10 seconds to appear

### Metrics showing 0?

Metrics are in-memory and reset on API restart. Make some requests first:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/metrics
```

---

## 📚 Next Steps

- Explore Langfuse dashboard features
- Set up custom scores for quality tracking
- Create Langfuse dashboards for specific use cases
- Integrate with alerting tools
- Move to Phase 14: GraphRAG!

---

**Happy Observing! 🔍**
