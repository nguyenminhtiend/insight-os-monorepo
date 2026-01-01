# Phase 3: Database Foundation - Postgres, Drizzle, Redis

> **Goal:** Set up persistent data layer with PostgreSQL (Drizzle ORM) and Redis for caching, establishing the foundation for RAG and memory systems.

---

## Prerequisites

- Phase 2 completed (LLM with structured outputs)
- PostgreSQL installed locally or Docker
- Redis installed locally or Docker

---

## Tech Stack Additions

| Tool        | Purpose                     |
| ----------- | --------------------------- |
| PostgreSQL  | Primary database            |
| Drizzle ORM | Type-safe database client   |
| drizzle-kit | Migrations and studio       |
| Redis       | Caching and session storage |
| ioredis     | Redis client                |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── db/
│           │   ├── index.ts           # NEW: Database client
│           │   ├── schema.ts          # NEW: Drizzle schema
│           │   └── migrations/        # NEW: Generated migrations
│           ├── lib/
│           │   └── redis.ts           # NEW: Redis client
│           └── routes/
│               └── conversations.ts   # NEW: Conversation persistence
│
├── packages/
│   └── db-schema/                     # NEW: Shared DB schema package
│       ├── src/
│       │   ├── index.ts
│       │   ├── schema.ts
│       │   └── types.ts
│       ├── drizzle.config.ts
│       └── package.json
```

---

## Implementation Steps

### Step 1: Create Database Schema Package

**1.1 Create `packages/db-schema/package.json`:**

```json
{
  "name": "@insight-os/db-schema",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./schema": {
      "types": "./src/schema.ts",
      "default": "./src/schema.ts"
    }
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.2",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.1",
    "typescript": "^5.7.2"
  }
}
```

**1.2 Create `packages/db-schema/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**1.3 Create `packages/db-schema/drizzle.config.ts`:**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/insightos'
  }
});
```

**1.4 Create `packages/db-schema/src/schema.ts`:**

```typescript
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  index,
  pgEnum
} from 'drizzle-orm/pg-core';

// Enums
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
  'deleted'
]);

// Conversations table
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    status: conversationStatusEnum('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('conversations_status_idx').on(table.status),
    index('conversations_created_at_idx').on(table.createdAt)
  ]
);

// Messages table
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<{
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      latencyMs?: number;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('messages_conversation_idx').on(table.conversationId),
    index('messages_created_at_idx').on(table.createdAt)
  ]
);

// Analysis results table
export const analysisResults = pgTable(
  'analysis_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null'
    }),
    type: text('type').notNull(), // 'company', 'market', 'trend'
    subject: text('subject').notNull(), // What was analyzed
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    promptId: text('prompt_id'), // Which prompt template was used
    model: text('model').notNull(),
    usage: jsonb('usage').$type<{
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('analysis_type_idx').on(table.type),
    index('analysis_subject_idx').on(table.subject),
    index('analysis_created_at_idx').on(table.createdAt)
  ]
);

// Cache table (for semantic caching in Phase 6)
export const cache = pgTable(
  'cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').unique().notNull(),
    value: jsonb('value').notNull(),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [index('cache_key_idx').on(table.key), index('cache_expires_idx').on(table.expiresAt)]
);

// Export table types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;
```

**1.5 Create `packages/db-schema/src/index.ts`:**

```typescript
export * from './schema.js';
export { drizzle } from 'drizzle-orm/postgres-js';
export { eq, desc, asc, and, or, isNull, sql } from 'drizzle-orm';
```

---

### Step 2: Set Up Database in API

**2.1 Update `apps/api/package.json` dependencies:**

```json
{
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "hono": "^4.6.14",
    "@insight-os/shared": "workspace:*",
    "@insight-os/db-schema": "workspace:*",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "postgres": "^3.4.5",
    "drizzle-orm": "^0.38.2",
    "ioredis": "^5.4.2",
    "zod": "^3.24.1"
  }
}
```

**2.2 Create `apps/api/src/db/index.ts`:**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@insight-os/db-schema/schema';

// Connection string
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/insightos';

// Create postgres client
const client = postgres(connectionString, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10
});

// Create drizzle instance
export const db = drizzle(client, { schema });

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}
```

**2.3 Create `apps/api/src/lib/redis.ts`:**

```typescript
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  }
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

// Cache helpers
export const cacheHelpers = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  },

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  },

  async delete(key: string): Promise<void> {
    await redis.del(key);
  },

  async exists(key: string): Promise<boolean> {
    return (await redis.exists(key)) === 1;
  },

  // Pattern-based delete
  async deletePattern(pattern: string): Promise<number> {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return redis.del(...keys);
  }
};

// Graceful shutdown
export async function closeRedisConnection(): Promise<void> {
  await redis.quit();
}
```

---

### Step 3: Create Conversations API

**3.1 Create `apps/api/src/routes/conversations.ts`:**

```typescript
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  conversations,
  messages,
  eq,
  desc,
  type NewConversation,
  type NewMessage
} from '@insight-os/db-schema';
import { createResponse, createErrorResponse, generateId } from '@insight-os/shared';

export const conversationsRoutes = new Hono();

/**
 * GET /conversations
 * List all conversations
 */
conversationsRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const results = await db
      .select()
      .from(conversations)
      .where(eq(conversations.status, 'active'))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    return c.json(
      createResponse({
        conversations: results,
        pagination: { limit, offset }
      })
    );
  } catch (error) {
    console.error('List conversations error:', error);
    return c.json(createErrorResponse('Failed to list conversations'), 500);
  }
});

/**
 * POST /conversations
 * Create a new conversation
 */
conversationsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<{ title?: string; metadata?: Record<string, unknown> }>();

    const newConversation: NewConversation = {
      title: body.title || 'New Conversation',
      metadata: body.metadata
    };

    const [created] = await db.insert(conversations).values(newConversation).returning();

    return c.json(createResponse(created), 201);
  } catch (error) {
    console.error('Create conversation error:', error);
    return c.json(createErrorResponse('Failed to create conversation'), 500);
  }
});

/**
 * GET /conversations/:id
 * Get a conversation with its messages
 */
conversationsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (conversation.length === 0) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    return c.json(
      createResponse({
        ...conversation[0],
        messages: conversationMessages
      })
    );
  } catch (error) {
    console.error('Get conversation error:', error);
    return c.json(createErrorResponse('Failed to get conversation'), 500);
  }
});

/**
 * POST /conversations/:id/messages
 * Add a message to a conversation
 */
conversationsRoutes.post('/:id/messages', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      metadata?: Record<string, unknown>;
    }>();

    // Verify conversation exists
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (conversation.length === 0) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    const newMessage: NewMessage = {
      conversationId: id,
      role: body.role,
      content: body.content,
      metadata: body.metadata
    };

    const [created] = await db.insert(messages).values(newMessage).returning();

    // Update conversation timestamp
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

    return c.json(createResponse(created), 201);
  } catch (error) {
    console.error('Add message error:', error);
    return c.json(createErrorResponse('Failed to add message'), 500);
  }
});

/**
 * DELETE /conversations/:id
 * Soft delete a conversation
 */
conversationsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const [updated] = await db
      .update(conversations)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    if (!updated) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    return c.json(createResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete conversation error:', error);
    return c.json(createErrorResponse('Failed to delete conversation'), 500);
  }
});

/**
 * PATCH /conversations/:id
 * Update conversation title/metadata
 */
conversationsRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      title?: string;
      metadata?: Record<string, unknown>;
    }>();

    const [updated] = await db
      .update(conversations)
      .set({
        ...(body.title && { title: body.title }),
        ...(body.metadata && { metadata: body.metadata }),
        updatedAt: new Date()
      })
      .where(eq(conversations.id, id))
      .returning();

    if (!updated) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    return c.json(createResponse(updated));
  } catch (error) {
    console.error('Update conversation error:', error);
    return c.json(createErrorResponse('Failed to update conversation'), 500);
  }
});
```

---

### Step 4: Update Health Check & Main Entry

**4.1 Update `apps/api/src/routes/health.ts`:**

```typescript
import { Hono } from 'hono';
import { createResponse, type HealthStatus } from '@insight-os/shared';
import { checkDatabaseHealth } from '../db/index.js';
import { checkRedisHealth } from '../lib/redis.js';

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
  const [dbHealthy, redisHealthy] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  const allHealthy = dbHealthy && redisHealthy;

  const health: HealthStatus = {
    status: allHealthy ? 'healthy' : 'degraded',
    version: '0.0.3',
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };

  return c.json(
    createResponse({
      ...health,
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected'
      }
    })
  );
});

healthRoutes.get('/ready', async (c) => {
  const [dbHealthy, redisHealthy] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  if (!dbHealthy || !redisHealthy) {
    return c.json(createResponse({ ready: false }), 503);
  }

  return c.json(createResponse({ ready: true }));
});

healthRoutes.get('/live', (c) => {
  return c.json(createResponse({ live: true }));
});
```

**4.2 Update `apps/api/src/index.ts`:**

```typescript
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { analyzeRoutes } from './routes/analyze.js';
import { conversationsRoutes } from './routes/conversations.js';
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

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.3',
    endpoints: {
      health: '/health',
      chat: '/chat',
      analyze: '/analyze',
      conversations: '/conversations'
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
```

**4.3 Update `apps/api/.env`:**

```env
OPENAI_API_KEY=sk-your-key-here
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/insightos
REDIS_URL=redis://localhost:6379
API_PORT=3001
```

---

### Step 5: Database Setup Commands

**5.1 Create database (if not using Docker):**

```bash
# Create database
createdb insightos

# Or via psql
psql -c "CREATE DATABASE insightos;"
```

**5.2 Run migrations:**

```bash
cd packages/db-schema
pnpm db:push  # Push schema directly (dev)
# OR
pnpm db:generate  # Generate migration files
pnpm db:migrate   # Run migrations (production)
```

**5.3 View database with Drizzle Studio:**

```bash
cd packages/db-schema
pnpm db:studio
```

---

## Demo Checklist

- [ ] PostgreSQL connection works
- [ ] Redis connection works
- [ ] Health check shows all services status
- [ ] Create conversation via API
- [ ] Add messages to conversation
- [ ] List conversations with pagination
- [ ] Delete conversation (soft delete)
- [ ] Drizzle Studio shows data

---

## API Testing

```bash
# Check health with services
curl http://localhost:3001/health

# Create conversation
curl -X POST http://localhost:3001/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Tesla Analysis Session"}'

# Get conversation (use returned ID)
curl http://localhost:3001/conversations/{id}

# Add message
curl -X POST http://localhost:3001/conversations/{id}/messages \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Tell me about Tesla"}'

# List conversations
curl http://localhost:3001/conversations
```

---

## What's Next

**Phase 4: Vector Search** will add:

- pgvector extension for embeddings
- OpenAI embeddings generation
- Vector similarity search
- Foundation for RAG
