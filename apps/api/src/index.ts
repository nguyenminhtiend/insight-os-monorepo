import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { analyzeRoutes } from './routes/analyze.js';
import { conversationsRoutes } from './routes/conversations.js';
import { embeddingsRoutes } from './routes/embeddings.js';
import { documentsRoutes } from './routes/documents.js';
import { ragRoutes } from './routes/rag.js';
import { agentsRoutes } from './routes/agents.js';
import { memoryRoutes } from './routes/memory.js';
import { closeDatabaseConnection } from './db/index.js';
import { closeRedisConnection } from './lib/redis.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    credentials: true
  })
);

// Routes
app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);
app.route('/analyze', analyzeRoutes);
app.route('/conversations', conversationsRoutes);
app.route('/embeddings', embeddingsRoutes);
app.route('/documents', documentsRoutes);
app.route('/rag', ragRoutes);
app.route('/agents', agentsRoutes);
app.route('/memory', memoryRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.8',
    endpoints: {
      health: '/health',
      chat: '/chat',
      chatStream: '/chat/stream',
      analyzeCompany: '/analyze/company',
      analyzeCompanyStream: '/analyze/company/stream',
      analyzeResearch: '/analyze/research',
      analyzeAuto: '/analyze/auto',
      prompts: '/analyze/prompts',
      conversations: '/conversations',
      embeddings: '/embeddings',
      documents: '/documents',
      ragQuery: '/rag/query',
      ragQueryStream: '/rag/query/stream',
      ragQueryMulti: '/rag/query/multi',
      ragRetrieve: '/rag/retrieve',
      ragCacheStats: '/rag/cache/stats',
      ragCacheClear: '/rag/cache',
      agentsTools: '/agents/tools',
      agentsResearch: '/agents/research',
      agentsResearchStream: '/agents/research/stream',
      agentsToolExecute: '/agents/tool/execute',
      memoryGet: '/memory/:userId',
      memoryStore: '/memory/:userId',
      memorySearch: '/memory/:userId/search',
      memoryExtract: '/memory/:userId/extract',
      memoryRelevant: '/memory/:userId/relevant',
      memoryDelete: '/memory/:userId/:memoryId'
    }
  });
});

const port = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

const server = serve({
  fetch: app.fetch,
  port
});

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down...');
  await Promise.all([closeDatabaseConnection(), closeRedisConnection()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
