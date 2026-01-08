# What to Expect in Langfuse Dashboard

## 🎨 Langfuse Dashboard Overview

After running your InsightOS API with Phase 13 observability, here's what you'll see in the Langfuse dashboard at https://cloud.langfuse.com

---

## 1. Traces View

### Main Traces List
```
┌─────────────────────────────────────────────────────────────────┐
│ Traces                                        🔍 Search   Filter  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ POST /chat                                          ✓ 245ms      │
│ 2026-01-08 10:23:45 · conversationId: demo-001                  │
│ Tokens: 150 → 320 · Cost: $0.0003                               │
│                                                                   │
│ POST /rag/query                                     ✓ 567ms      │
│ 2026-01-08 10:23:12 · query: "market analysis"                  │
│ Tokens: 80 → 420 · Cost: $0.0004                                │
│                                                                   │
│ POST /analyze/company                               ✓ 1,234ms    │
│ 2026-01-08 10:22:38 · company: "OpenAI"                         │
│ Tokens: 200 → 850 · Cost: $0.0008                               │
│                                                                   │
│ POST /chat                                          ✗ 123ms      │
│ 2026-01-08 10:22:01 · ERROR: Validation failed                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**What you'll see:**
- ✅ **Green checkmarks** for successful requests
- ❌ **Red X's** for errors
- ⏱️ **Duration** for each request
- 💰 **Token counts** and estimated costs
- 🏷️ **Metadata** from your requests

---

## 2. Individual Trace View

Click on any trace to see details:

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Traces                                   POST /chat    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Overview                                                          │
│ ├─ Name: POST /chat                                              │
│ ├─ Status: ✓ Success                                             │
│ ├─ Duration: 245ms                                               │
│ ├─ Timestamp: 2026-01-08 10:23:45                                │
│ └─ Metadata:                                                      │
│     · method: POST                                                │
│     · path: /chat                                                 │
│     · statusCode: 200                                             │
│     · userAgent: curl/7.88.1                                      │
│                                                                   │
│ Execution Timeline                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 0ms          100ms         200ms         245ms              │ │
│ │ ├────────────────────────────────────────┤                  │ │
│ │ │          generateText                   │                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Generations (1)                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ generateText                                                 │ │
│ │ Model: gpt-4o-mini                                          │ │
│ │ Duration: 223ms                                              │ │
│ │                                                              │ │
│ │ Input:                                                       │ │
│ │ {                                                            │ │
│ │   "system": "You are InsightOS, a strategic...",           │ │
│ │   "prompt": "What are the key factors..."                  │ │
│ │ }                                                            │ │
│ │                                                              │ │
│ │ Output:                                                      │ │
│ │ "Market analysis typically involves several..."             │ │
│ │                                                              │ │
│ │ Usage:                                                       │ │
│ │ · Prompt tokens: 150                                        │ │
│ │ · Completion tokens: 320                                    │ │
│ │ · Total: 470                                                 │ │
│ │ · Cost: $0.0003                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key sections:**
1. **Overview**: High-level trace information
2. **Timeline**: Visual execution flow
3. **Generations**: LLM calls with full details
4. **Input/Output**: Exact prompts and responses
5. **Usage**: Token counts and costs

---

## 3. RAG Query Trace (Complex Example)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Traces                              POST /rag/query    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Overview                                                          │
│ ├─ Name: POST /rag/query                                         │
│ ├─ Status: ✓ Success                                             │
│ ├─ Duration: 567ms                                               │
│ └─ Metadata: { query: "market analysis", topK: 3 }              │
│                                                                   │
│ Execution Timeline                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 0ms     100ms    200ms    300ms    400ms    500ms    567ms  │ │
│ │ ├──────┤├──────────────────────────┤├──────────────────┤   │ │
│ │ │ embed││    vector search         ││   generation    │   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Generations (2)                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1. generate-embedding                                        │ │
│ │    Model: text-embedding-3-small                            │ │
│ │    Duration: 89ms                                            │ │
│ │    Input: "market analysis"                                 │ │
│ │    Output: [0.123, -0.456, ...] (1536 dims)                │ │
│ │    Tokens: 2 · Cost: $0.00001                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 2. generateText                                              │ │
│ │    Model: gpt-4o-mini                                       │ │
│ │    Duration: 312ms                                           │ │
│ │    Input:                                                    │ │
│ │      System: "Answer based on context"                      │ │
│ │      Context: [3 chunks with market data]                   │ │
│ │      Query: "market analysis"                               │ │
│ │    Output: "Market analysis is the process..."              │ │
│ │    Tokens: 80 → 420 · Cost: $0.0004                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Shows:**
- Multiple LLM calls in sequence
- Different models (embedding + generation)
- Full context passed to LLM
- Cumulative costs

---

## 4. Error Trace

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Traces                                   POST /chat    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Overview                                                          │
│ ├─ Name: POST /chat                                              │
│ ├─ Status: ✗ ERROR                                              │
│ ├─ Duration: 123ms                                               │
│ └─ Metadata:                                                      │
│     · error: "Validation failed: message is required"           │
│     · statusCode: 400                                             │
│                                                                   │
│ Error Details                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ValidationError: message is required                         │ │
│ │                                                              │ │
│ │ Stack trace:                                                 │ │
│ │   at validateChatRequest (chat.ts:23)                       │ │
│ │   at POST /chat (chat.ts:45)                                │ │
│ │   at dispatch (index.ts:102)                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Request Data                                                      │
│ {                                                                 │
│   "invalid": "data"                                              │
│ }                                                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Debugging info:**
- Error message
- Stack trace
- Request data that caused error
- Helpful for debugging issues

---

## 5. Analytics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ Analytics                               Last 24 hours   Filter   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Overview                                                          │
│ ┌─────────────────┬─────────────────┬─────────────────┐         │
│ │ Total Traces    │ Total Tokens    │ Total Cost      │         │
│ │ 127             │ 45,230          │ $0.0342         │         │
│ └─────────────────┴─────────────────┴─────────────────┘         │
│                                                                   │
│ Traces Over Time                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 20 ┤                                           ╭─╮           │ │
│ │ 15 ┤                       ╭─╮        ╭─╮    │ │           │ │
│ │ 10 ┤           ╭─╮    ╭─╮ │ │   ╭─╮ │ │    │ │           │ │
│ │  5 ┤   ╭─╮    │ │    │ │ │ │   │ │ │ │    │ │           │ │
│ │  0 └───┴─┴────┴─┴────┴─┴─┴─┴───┴─┴─┴─┴────┴─┴───────────│ │
│ │    10am   11am   12pm   1pm   2pm   3pm   4pm             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Token Usage by Model                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ gpt-4o-mini          ████████████████████ 42,340 (93%)     │ │
│ │ text-embedding       ██ 2,890 (7%)                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Cost by Endpoint                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ /rag/query           ████████ $0.0145                      │ │
│ │ /chat                ████████ $0.0125                      │ │
│ │ /analyze/company     ████ $0.0072                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Average Latency                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ /rag/query           567ms ████████                        │ │
│ │ /analyze/company     1,234ms ████████████████              │ │
│ │ /chat                245ms ████                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Analytics features:**
- Traces over time
- Token usage by model
- Cost breakdown by endpoint
- Latency distribution
- Error rates

---

## 6. Useful Filters

### By Status
- ✓ Success only
- ✗ Errors only
- All

### By Endpoint
- `/chat`
- `/rag/query`
- `/analyze/company`
- All endpoints

### By Time Range
- Last hour
- Last 24 hours
- Last 7 days
- Custom range

### By Cost
- High cost (> $0.001)
- Medium cost
- Low cost

### By Duration
- Slow (> 1s)
- Normal (100ms - 1s)
- Fast (< 100ms)

---

## 7. Search Examples

Search for specific traces:

```
conversationId:demo-001        # Find specific conversation
error:validation               # Find validation errors
model:gpt-4o-mini             # Find specific model usage
cost:>0.001                    # Find expensive requests
duration:>1000                 # Find slow requests (>1s)
```

---

## 8. What You Can Do

### Debugging
- ✅ Find failed requests
- ✅ See exact error messages
- ✅ View request data that caused issues
- ✅ Trace execution flow

### Optimization
- ✅ Identify slow endpoints
- ✅ Find expensive LLM calls
- ✅ Optimize token usage
- ✅ Reduce latency

### Monitoring
- ✅ Track request volume
- ✅ Monitor error rates
- ✅ Watch costs in real-time
- ✅ Analyze usage patterns

### Quality
- ✅ Review LLM outputs
- ✅ Test prompt variations
- ✅ A/B test different approaches
- ✅ Log quality scores

---

## 9. Real-World Example

**Scenario:** RAG query is slow

**Investigation:**
1. Filter traces by `/rag/query`
2. Sort by duration (slowest first)
3. Click on a slow trace
4. View timeline:
   - Embedding: 89ms ✓
   - Vector search: 1,234ms ⚠️ (bottleneck!)
   - Generation: 312ms ✓
5. **Action:** Optimize vector search (add index, reduce topK, etc.)

**Result:** Reduced latency from 1,635ms → 567ms

---

## 10. Tips & Tricks

### Pro Tips
1. **Use tags**: Add custom metadata for filtering
2. **Session grouping**: Link related requests
3. **Quality scores**: Log relevance, accuracy metrics
4. **Prompt versions**: Track template changes
5. **User IDs**: Trace user-specific behavior

### Best Practices
- Review traces daily
- Set up cost alerts
- Monitor error rates
- Optimize expensive operations
- A/B test prompt changes

### Common Patterns
- Filter by endpoint to analyze specific features
- Search by error to debug issues
- Sort by cost to find optimization opportunities
- Sort by duration to identify bottlenecks

---

## Conclusion

With Langfuse, you have complete visibility into your InsightOS API. Every request is traced, every LLM call is logged, and you can debug, optimize, and monitor your AI application with confidence.

**Your dashboard will show:**
- ✅ All HTTP requests
- ✅ All LLM calls with I/O
- ✅ Token usage and costs
- ✅ Performance metrics
- ✅ Error details
- ✅ Analytics and trends

**Happy debugging! 🔍**
