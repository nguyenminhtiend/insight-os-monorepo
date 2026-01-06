# Phase 13: Observability - Langfuse Tracing

> **Goal:** Add comprehensive observability with Langfuse for tracing, metrics, cost tracking, and debugging LLM applications.

---

## Prerequisites

- Phase 12 completed (background jobs)
- Langfuse account or self-hosted instance

---

## Implementation Steps

### Step 1: Install Langfuse

**1.1 Add to `apps/api/package.json`:**

```bash
pnpm add langfuse
```

**1.2 Add environment variables:**

```env
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASEURL=https://cloud.langfuse.com  # or self-hosted URL
```

### Step 2: Create Observability Utilities

**2.1 Create `apps/api/src/lib/observability.ts`:**

```typescript
import { Langfuse } from 'langfuse';

// Initialize Langfuse
export const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

// Ensure traces are flushed on shutdown
export async function flushTraces(): Promise<void> {
  await langfuse.shutdownAsync();
}

/**
 * Create a trace for a request
 */
export function createTrace(name: string, metadata?: Record<string, unknown>) {
  return langfuse.trace({
    name,
    metadata,
    timestamp: new Date(),
  });
}

/**
 * Wrapper for LLM calls with automatic tracing
 */
export async function tracedLLMCall<T>(
  trace: ReturnType<typeof createTrace>,
  name: string,
  fn: () => Promise<T>,
  metadata?: {
    model?: string;
    input?: unknown;
    promptTemplate?: string;
  },
): Promise<T> {
  const generation = trace.generation({
    name,
    model: metadata?.model,
    input: metadata?.input,
    metadata: { promptTemplate: metadata?.promptTemplate },
    startTime: new Date(),
  });

  try {
    const result = await fn();
    generation.end({
      output: result,
      endTime: new Date(),
    });
    return result;
  } catch (error) {
    generation.end({
      statusMessage: error instanceof Error ? error.message : 'Unknown error',
      level: 'ERROR',
      endTime: new Date(),
    });
    throw error;
  }
}

/**
 * Create a span for operations
 */
export function createSpan(trace: ReturnType<typeof createTrace>, name: string, input?: unknown) {
  return trace.span({
    name,
    input,
    startTime: new Date(),
  });
}

/**
 * Track token usage and costs
 */
export function trackUsage(
  generation: ReturnType<ReturnType<typeof createTrace>['generation']>,
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
  model: string,
) {
  generation.update({
    usage: {
      input: usage.promptTokens,
      output: usage.completionTokens,
      total: usage.totalTokens,
      unit: 'TOKENS',
    },
    model,
  });
}

/**
 * Log a score/evaluation
 */
export function logScore(
  trace: ReturnType<typeof createTrace>,
  name: string,
  value: number,
  comment?: string,
) {
  trace.score({
    name,
    value,
    comment,
  });
}
```

### Step 3: Integrate with AI Calls

**3.1 Update `apps/api/src/lib/ai.ts`:**

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createTrace, tracedLLMCall } from './observability.js';

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const DEFAULT_MODEL = 'gpt-4o-mini';

export const MODELS = {
  fast: 'gpt-4o-mini',
  smart: 'gpt-4o-mini',
  reasoning: 'o1-mini',
} as const;

/**
 * Traced text generation
 */
export async function tracedGenerateText(
  traceName: string,
  options: {
    model: string;
    system?: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  },
) {
  const trace = createTrace(traceName);

  const result = await tracedLLMCall(
    trace,
    'generateText',
    async () => {
      const { generateText } = await import('ai');
      return generateText({
        model: openai(options.model),
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
    },
    {
      model: options.model,
      input: { system: options.system, prompt: options.prompt },
    },
  );

  return { result, trace };
}
```

### Step 4: Add Observability Middleware

**4.1 Create `apps/api/src/middleware/tracing.ts`:**

```typescript
import { createMiddleware } from 'hono/factory';
import { createTrace } from '../lib/observability.js';

export const tracingMiddleware = createMiddleware(async (c, next) => {
  const trace = createTrace(`${c.req.method} ${c.req.path}`, {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent'),
  });

  // Attach trace to context
  c.set('trace', trace);

  const startTime = Date.now();

  try {
    await next();

    const duration = Date.now() - startTime;
    trace.update({
      metadata: {
        statusCode: c.res.status,
        duration,
      },
    });
  } catch (error) {
    trace.update({
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
      },
    });
    throw error;
  }
});
```

### Step 5: Add Metrics Endpoint

**5.1 Create `apps/api/src/routes/metrics.ts`:**

```typescript
import { Hono } from 'hono';
import { langfuse } from '../lib/observability.js';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const metricsRoutes = new Hono();

// In-memory metrics (use Redis in production)
const metrics = {
  requests: 0,
  llmCalls: 0,
  tokens: { prompt: 0, completion: 0 },
  errors: 0,
  latency: [] as number[],
};

export function recordMetric(
  type: 'request' | 'llm_call' | 'error',
  data?: { tokens?: { prompt: number; completion: number }; latency?: number },
) {
  switch (type) {
    case 'request':
      metrics.requests++;
      if (data?.latency) metrics.latency.push(data.latency);
      break;
    case 'llm_call':
      metrics.llmCalls++;
      if (data?.tokens) {
        metrics.tokens.prompt += data.tokens.prompt;
        metrics.tokens.completion += data.tokens.completion;
      }
      break;
    case 'error':
      metrics.errors++;
      break;
  }
}

metricsRoutes.get('/', (c) => {
  const avgLatency =
    metrics.latency.length > 0
      ? metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length
      : 0;

  return c.json(
    createResponse({
      requests: metrics.requests,
      llmCalls: metrics.llmCalls,
      tokens: metrics.tokens,
      estimatedCost: calculateCost(metrics.tokens),
      errors: metrics.errors,
      avgLatencyMs: avgLatency.toFixed(2),
    }),
  );
});

function calculateCost(tokens: { prompt: number; completion: number }): string {
  // GPT-4o-mini pricing (approximate)
  const promptCost = (tokens.prompt / 1000000) * 0.15;
  const completionCost = (tokens.completion / 1000000) * 0.6;
  return `$${(promptCost + completionCost).toFixed(4)}`;
}
```

---

## Demo Checklist

- [ ] Langfuse receives traces
- [ ] LLM calls show in Langfuse
- [ ] Token usage tracked
- [ ] Cost estimates accurate
- [ ] Error traces logged
- [ ] Metrics endpoint works

---

## What's Next

**Phase 14: GraphRAG** will add:

- Neo4j integration
- Knowledge graph extraction
- Graph-enhanced retrieval
