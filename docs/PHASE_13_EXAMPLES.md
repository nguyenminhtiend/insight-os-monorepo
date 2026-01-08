# Phase 13: Observability Usage Examples

## Example 1: Basic Traced LLM Call

```typescript
import { tracedGenerateText } from './lib/ai.js';

async function analyzeCompany(companyName: string) {
  const { result, trace } = await tracedGenerateText(
    'company-analysis',
    {
      model: 'gpt-4o-mini',
      system: 'You are a market analyst',
      prompt: `Analyze ${companyName}`,
      temperature: 0.7,
    }
  );

  // Optionally log a quality score
  const { logScore } = await import('./lib/observability.js');
  logScore(trace, 'response-quality', 0.85, 'Good structured output');

  return result.text;
}
```

---

## Example 2: Traced RAG Pipeline

```typescript
import { createTrace, createSpan } from './lib/observability.js';

async function tracedRAGQuery(query: string) {
  const trace = createTrace('rag-query', { query });

  // Span 1: Embedding generation
  const embeddingSpan = createSpan(trace, 'generate-embedding', { query });
  const embedding = await generateEmbedding(query);
  embeddingSpan.end({ output: { dimensions: embedding.length } });

  // Span 2: Vector search
  const searchSpan = createSpan(trace, 'vector-search', { topK: 5 });
  const chunks = await searchVectors(embedding, 5);
  searchSpan.end({ output: { found: chunks.length } });

  // Span 3: Reranking
  const rerankSpan = createSpan(trace, 'rerank', { count: chunks.length });
  const reranked = await rerank(query, chunks);
  rerankSpan.end({ output: { topK: 3 } });

  // Span 4: LLM generation
  const { result } = await tracedGenerateText('rag-generation', {
    model: 'gpt-4o-mini',
    system: 'Answer based on context',
    prompt: `Context: ${reranked.map(c => c.content).join('\n\n')}\n\nQuestion: ${query}`,
  });

  trace.update({
    metadata: {
      chunkCount: chunks.length,
      finalAnswer: result.text.slice(0, 100),
    },
  });

  return result.text;
}
```

---

## Example 3: Traced Agent Workflow

```typescript
import { createTrace, createSpan, tracedLLMCall } from './lib/observability.js';

async function runAgentWorkflow(task: string) {
  const trace = createTrace('agent-workflow', { task });

  // Planning phase
  const planSpan = createSpan(trace, 'planning', { task });
  const plan = await tracedLLMCall(
    trace,
    'create-plan',
    async () => {
      // Your planning logic
      return { steps: ['research', 'analyze', 'summarize'] };
    },
    { model: 'gpt-4o-mini', input: { task } }
  );
  planSpan.end({ output: plan });

  // Execute each step
  const results = [];
  for (const step of plan.steps) {
    const stepSpan = createSpan(trace, `execute-${step}`, { step });
    const result = await executeStep(step);
    stepSpan.end({ output: result });
    results.push(result);
  }

  trace.update({
    metadata: {
      totalSteps: plan.steps.length,
      success: true,
    },
  });

  return results;
}
```

---

## Example 4: Custom Metrics Recording

```typescript
import { recordMetric } from './routes/metrics.js';

async function processDocument(docId: string) {
  const startTime = Date.now();

  try {
    // Process document...
    const result = await processDocumentLogic(docId);

    // Record successful processing
    const latency = Date.now() - startTime;
    recordMetric('request', { latency });

    // If it involved LLM calls, record token usage
    if (result.tokens) {
      recordMetric('llm_call', {
        tokens: {
          prompt: result.tokens.prompt,
          completion: result.tokens.completion,
        },
      });
    }

    return result;
  } catch (error) {
    // Record error
    recordMetric('error');
    throw error;
  }
}
```

---

## Example 5: Trace Context in Routes

```typescript
import { Hono } from 'hono';
import { createSpan } from '../lib/observability.js';

const routes = new Hono();

routes.post('/custom', async (c) => {
  // Get trace from context (set by tracing middleware)
  const trace = c.get('trace');

  // Add custom span
  const span = createSpan(trace, 'custom-operation', {
    userId: c.req.header('user-id'),
  });

  try {
    // Your logic here
    const result = await doSomething();

    span.end({ output: result });

    return c.json({ success: true, data: result });
  } catch (error) {
    span.end({
      statusMessage: error.message,
      level: 'ERROR',
    });
    throw error;
  }
});
```

---

## Example 6: Background Job Tracing

```typescript
import { createTrace, createSpan } from './lib/observability.js';

async function processBackgroundJob(jobData: any) {
  const trace = createTrace('background-job', {
    jobType: jobData.type,
    jobId: jobData.id,
  });

  const processingSpan = createSpan(trace, 'job-processing', jobData);

  try {
    // Process job
    const result = await processJobLogic(jobData);

    processingSpan.end({
      output: { success: true, processed: result.count },
    });

    trace.update({
      metadata: {
        duration: Date.now() - processingSpan.startTime.getTime(),
        success: true,
      },
    });

    return result;
  } catch (error) {
    processingSpan.end({
      statusMessage: error.message,
      level: 'ERROR',
    });

    trace.update({
      metadata: {
        success: false,
        error: error.message,
      },
    });

    throw error;
  }
}
```

---

## Example 7: A/B Testing with Scores

```typescript
import { tracedGenerateText, logScore } from './lib/observability.js';

async function abTestPrompts(query: string) {
  // Test variant A
  const { result: resultA, trace: traceA } = await tracedGenerateText(
    'prompt-variant-a',
    {
      model: 'gpt-4o-mini',
      system: 'You are a helpful assistant',
      prompt: query,
    }
  );
  logScore(traceA, 'variant', 1, 'Variant A');

  // Test variant B
  const { result: resultB, trace: traceB } = await tracedGenerateText(
    'prompt-variant-b',
    {
      model: 'gpt-4o-mini',
      system: 'You are an expert analyst',
      prompt: query,
    }
  );
  logScore(traceB, 'variant', 2, 'Variant B');

  // Log user preference when available
  // logScore(traceA, 'user-preference', userPreferredA ? 1 : 0);

  return { variantA: resultA.text, variantB: resultB.text };
}
```

---

## Example 8: Token Usage Tracking

```typescript
import { createTrace, trackUsage } from './lib/observability.js';

async function monitoredLLMCall(prompt: string) {
  const trace = createTrace('monitored-call');

  const generation = trace.generation({
    name: 'gpt-call',
    model: 'gpt-4o-mini',
    input: prompt,
    startTime: new Date(),
  });

  const { generateText } = await import('ai');
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt,
  });

  // Track actual token usage
  trackUsage(
    generation,
    {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
    'gpt-4o-mini'
  );

  generation.end({ output: result.text });

  return result;
}
```

---

## Best Practices

### 1. Consistent Naming
Use descriptive, hierarchical names:
- ✅ `rag-query-multi`
- ✅ `agent-research-planning`
- ✅ `memory-semantic-search`
- ❌ `query1`, `test`, `function`

### 2. Include Context
Add relevant metadata:
```typescript
createTrace('operation', {
  userId: 'user-123',
  sessionId: 'sess-456',
  featureFlag: 'new-rag-v2',
});
```

### 3. Track Quality
Log scores for important outputs:
```typescript
logScore(trace, 'relevance', 0.92, 'High quality retrieval');
logScore(trace, 'latency-sla', isUnder500ms ? 1 : 0);
```

### 4. Error Details
Include useful error information:
```typescript
generation.end({
  statusMessage: `${error.name}: ${error.message}`,
  level: 'ERROR',
  metadata: { stack: error.stack },
});
```

### 5. Flush on Shutdown
Always flush traces before exit:
```typescript
import { flushTraces } from './lib/observability.js';

process.on('SIGTERM', async () => {
  await flushTraces();
  process.exit(0);
});
```

---

## Debugging Workflow

1. **Find the trace**: Search by name, time, or user
2. **Analyze the flow**: See all spans and their timing
3. **Check inputs**: Review what was sent to LLMs
4. **Verify outputs**: Confirm responses are correct
5. **Measure costs**: Calculate token usage
6. **Identify bottlenecks**: Find slow operations

---

## Production Checklist

- [ ] Environment variables set correctly
- [ ] Traces include user context
- [ ] Sensitive data filtered from logs
- [ ] Error traces include useful details
- [ ] Scores logged for quality metrics
- [ ] Graceful shutdown flushes traces
- [ ] Monitoring alerts configured in Langfuse
- [ ] Metrics stored in Redis (not in-memory)

---

Ready to observe! 🔍
