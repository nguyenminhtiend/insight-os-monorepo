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
    });
    return result;
  } catch (error) {
    generation.end({
      statusMessage: error instanceof Error ? error.message : 'Unknown error',
      level: 'ERROR',
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
