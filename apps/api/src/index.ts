import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    credentials: true,
  }),
);

// Routes
app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.1',
    endpoints: {
      health: '/health',
      chat: '/chat',
      chatStream: '/chat/stream',
    },
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
