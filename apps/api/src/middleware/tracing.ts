import { createMiddleware } from 'hono/factory';
import { createTrace } from '../lib/observability.js';

export const tracingMiddleware = createMiddleware(async (c, next) => {
  const trace = createTrace(`${c.req.method} ${c.req.path}`, {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent')
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
        duration
      }
    });
  } catch (error) {
    trace.update({
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      }
    });
    throw error;
  }
});
