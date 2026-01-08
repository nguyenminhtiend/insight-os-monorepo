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
