import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Routes
app.route('/health', healthRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.1',
    docs: '/health',
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
