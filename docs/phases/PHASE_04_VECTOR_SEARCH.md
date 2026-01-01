# Phase 4: Vector Search - Embeddings & pgvector

> **Goal:** Add vector embeddings capabilities using pgvector, enabling semantic search as the foundation for RAG.

---

## Prerequisites

- Phase 3 completed (PostgreSQL + Drizzle + Redis)
- pgvector extension available in PostgreSQL

---

## Tech Stack Additions

| Tool | Purpose |
|------|---------|
| pgvector | Vector similarity search in PostgreSQL |
| OpenAI Embeddings | text-embedding-3-small model |
| Cosine Similarity | Vector distance metric |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── lib/
│           │   └── embeddings.ts      # NEW: Embedding utilities
│           └── routes/
│               └── embeddings.ts      # NEW: Embedding API
│
├── packages/
│   └── db-schema/
│       └── src/
│           └── schema.ts              # UPDATED: Add vector columns
```

---

## Implementation Steps

### Step 1: Enable pgvector Extension

**1.1 Create migration or run SQL:**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

Via Drizzle, add to a migration file or run directly.

---

### Step 2: Update Database Schema

**2.1 Update `packages/db-schema/src/schema.ts`:**

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
  pgEnum,
  vector,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom vector type for pgvector
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)'; // OpenAI embedding dimension
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

// Enums
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'archived', 'deleted']);
export const documentStatusEnum = pgEnum('document_status', ['pending', 'processing', 'completed', 'failed']);

// Conversations table (unchanged from Phase 3)
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  status: conversationStatusEnum('status').default('active').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('conversations_status_idx').on(table.status),
  index('conversations_created_at_idx').on(table.createdAt),
]);

// Messages table (unchanged)
export const messages = pgTable('messages', {
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('messages_conversation_idx').on(table.conversationId),
  index('messages_created_at_idx').on(table.createdAt),
]);

// Documents table (NEW - for RAG source documents)
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'pdf', 'txt', 'md', 'url'
  source: text('source'), // Original file path or URL
  content: text('content'), // Full text content
  status: documentStatusEnum('status').default('pending').notNull(),
  metadata: jsonb('metadata').$type<{
    size?: number;
    pageCount?: number;
    wordCount?: number;
    language?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('documents_status_idx').on(table.status),
  index('documents_type_idx').on(table.type),
]);

// Document chunks table (NEW - for chunked content with embeddings)
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vectorType('embedding'), // 1536-dim OpenAI embeddings
  metadata: jsonb('metadata').$type<{
    startChar?: number;
    endChar?: number;
    pageNumber?: number;
    section?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('chunks_document_idx').on(table.documentId),
  index('chunks_index_idx').on(table.chunkIndex),
  // Vector similarity index (HNSW for fast approximate search)
  index('chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);

// Analysis results (unchanged)
export const analysisResults = pgTable('analysis_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  subject: text('subject').notNull(),
  result: jsonb('result').$type<Record<string, unknown>>().notNull(),
  promptId: text('prompt_id'),
  model: text('model').notNull(),
  usage: jsonb('usage').$type<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('analysis_type_idx').on(table.type),
  index('analysis_subject_idx').on(table.subject),
]);

// Cache table (unchanged)
export const cache = pgTable('cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').unique().notNull(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('cache_key_idx').on(table.key),
  index('cache_expires_idx').on(table.expiresAt),
]);

// Type exports
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;
```

---

### Step 3: Create Embeddings Utilities

**3.1 Create `apps/api/src/lib/embeddings.ts`:**

```typescript
import { openai } from './ai.js';
import { embed, embedMany } from 'ai';
import { db } from '../db/index.js';
import { documentChunks, eq, sql } from '@insight-os/db-schema';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  });
  return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimensions must match');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for similar chunks using vector similarity
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    documentId?: string;
  } = {}
): Promise<Array<{
  id: string;
  content: string;
  documentId: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}>> {
  const { limit = 10, threshold = 0.7, documentId } = options;

  // Build vector string for pgvector
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  // Use raw SQL for vector similarity search
  const query = sql`
    SELECT
      id,
      content,
      document_id as "documentId",
      metadata,
      1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM document_chunks
    WHERE embedding IS NOT NULL
    ${documentId ? sql`AND document_id = ${documentId}` : sql``}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  const results = await db.execute(query);

  // Filter by threshold and type cast
  return (results.rows as any[])
    .filter((row) => row.similarity >= threshold)
    .map((row) => ({
      id: row.id,
      content: row.content,
      documentId: row.documentId,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
    }));
}

/**
 * Search similar chunks with a text query (auto-embeds)
 */
export async function searchByText(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    documentId?: string;
  } = {}
): Promise<Array<{
  id: string;
  content: string;
  documentId: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}>> {
  const queryEmbedding = await generateEmbedding(query);
  return searchSimilarChunks(queryEmbedding, options);
}

/**
 * Get embedding statistics
 */
export async function getEmbeddingStats(): Promise<{
  totalChunks: number;
  chunksWithEmbeddings: number;
  model: string;
  dimensions: number;
}> {
  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(documentChunks);

  const [withEmbeddings] = await db
    .select({ count: sql<number>`count(*)` })
    .from(documentChunks)
    .where(sql`embedding IS NOT NULL`);

  return {
    totalChunks: Number(total.count),
    chunksWithEmbeddings: Number(withEmbeddings.count),
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}
```

---

### Step 4: Create Embeddings API Routes

**4.1 Create `apps/api/src/routes/embeddings.ts`:**

```typescript
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  documents,
  documentChunks,
  eq,
  type NewDocument,
  type NewDocumentChunk,
} from '@insight-os/db-schema';
import {
  generateEmbedding,
  generateEmbeddings,
  searchByText,
  getEmbeddingStats,
} from '../lib/embeddings.js';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const embeddingsRoutes = new Hono();

/**
 * GET /embeddings/stats
 * Get embedding statistics
 */
embeddingsRoutes.get('/stats', async (c) => {
  try {
    const stats = await getEmbeddingStats();
    return c.json(createResponse(stats));
  } catch (error) {
    console.error('Stats error:', error);
    return c.json(createErrorResponse('Failed to get stats'), 500);
  }
});

/**
 * POST /embeddings/generate
 * Generate embedding for text
 */
embeddingsRoutes.post('/generate', async (c) => {
  try {
    const { text } = await c.req.json<{ text: string }>();

    if (!text) {
      return c.json(createErrorResponse('Text is required'), 400);
    }

    const embedding = await generateEmbedding(text);

    return c.json(createResponse({
      embedding,
      dimensions: embedding.length,
      model: 'text-embedding-3-small',
    }));
  } catch (error) {
    console.error('Generate embedding error:', error);
    return c.json(createErrorResponse('Failed to generate embedding'), 500);
  }
});

/**
 * POST /embeddings/batch
 * Generate embeddings for multiple texts
 */
embeddingsRoutes.post('/batch', async (c) => {
  try {
    const { texts } = await c.req.json<{ texts: string[] }>();

    if (!texts || texts.length === 0) {
      return c.json(createErrorResponse('Texts array is required'), 400);
    }

    if (texts.length > 100) {
      return c.json(createErrorResponse('Maximum 100 texts per batch'), 400);
    }

    const embeddings = await generateEmbeddings(texts);

    return c.json(createResponse({
      embeddings,
      count: embeddings.length,
      dimensions: embeddings[0]?.length || 0,
    }));
  } catch (error) {
    console.error('Batch embedding error:', error);
    return c.json(createErrorResponse('Failed to generate embeddings'), 500);
  }
});

/**
 * POST /embeddings/search
 * Search for similar content
 */
embeddingsRoutes.post('/search', async (c) => {
  try {
    const { query, limit = 10, threshold = 0.7, documentId } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentId?: string;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const results = await searchByText(query, { limit, threshold, documentId });

    return c.json(createResponse({
      results,
      query,
      count: results.length,
    }));
  } catch (error) {
    console.error('Search error:', error);
    return c.json(createErrorResponse('Search failed'), 500);
  }
});

/**
 * POST /embeddings/store
 * Store text with its embedding (for testing)
 */
embeddingsRoutes.post('/store', async (c) => {
  try {
    const { content, documentId, metadata } = await c.req.json<{
      content: string;
      documentId: string;
      metadata?: Record<string, unknown>;
    }>();

    if (!content || !documentId) {
      return c.json(createErrorResponse('Content and documentId are required'), 400);
    }

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Get next chunk index for this document
    const existingChunks = await db
      .select({ maxIndex: sql<number>`COALESCE(MAX(chunk_index), -1)` })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    const nextIndex = (existingChunks[0]?.maxIndex ?? -1) + 1;

    // Store chunk with embedding
    const [chunk] = await db
      .insert(documentChunks)
      .values({
        documentId,
        chunkIndex: nextIndex,
        content,
        embedding,
        metadata,
      })
      .returning();

    return c.json(createResponse({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      embeddingDimensions: embedding.length,
    }), 201);
  } catch (error) {
    console.error('Store error:', error);
    return c.json(createErrorResponse('Failed to store content'), 500);
  }
});

// Import sql for raw queries
import { sql } from '@insight-os/db-schema';
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
import { embeddingsRoutes } from './routes/embeddings.js';
import { closeDatabaseConnection } from './db/index.js';
import { closeRedisConnection } from './lib/redis.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000'],
  credentials: true,
}));

// Routes
app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);
app.route('/analyze', analyzeRoutes);
app.route('/conversations', conversationsRoutes);
app.route('/embeddings', embeddingsRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.4',
    endpoints: {
      health: '/health',
      chat: '/chat',
      analyze: '/analyze',
      conversations: '/conversations',
      embeddings: '/embeddings',
    },
  });
});

const port = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down...');
  await Promise.all([
    closeDatabaseConnection(),
    closeRedisConnection(),
  ]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
```

---

## Demo Checklist

- [ ] pgvector extension enabled
- [ ] Generate single embedding works
- [ ] Batch embedding generation works
- [ ] Store content with embedding
- [ ] Vector similarity search returns results
- [ ] Similarity threshold filtering works
- [ ] Embedding stats endpoint works

---

## API Testing

```bash
# Get embedding stats
curl http://localhost:3001/embeddings/stats

# Generate single embedding
curl -X POST http://localhost:3001/embeddings/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Tesla is an electric vehicle company"}'

# Generate batch embeddings
curl -X POST http://localhost:3001/embeddings/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["First text", "Second text", "Third text"]}'

# First, create a document (for testing)
curl -X POST http://localhost:3001/documents \
  -H "Content-Type: application/json" \
  -d '{"name": "test-doc", "type": "txt", "content": "Test document"}'

# Store content with embedding (use document ID from above)
curl -X POST http://localhost:3001/embeddings/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Tesla produces electric vehicles and solar panels",
    "documentId": "{document-id-here}"
  }'

# Search similar content
curl -X POST http://localhost:3001/embeddings/search \
  -H "Content-Type: application/json" \
  -d '{"query": "electric cars", "limit": 5, "threshold": 0.5}'
```

---

## Performance Notes

### Vector Index Tuning

For production, tune the HNSW index:

```sql
-- More accurate but slower index
CREATE INDEX chunks_embedding_idx ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Query time accuracy
SET hnsw.ef_search = 40;  -- Higher = more accurate, slower
```

### Embedding Costs

- OpenAI text-embedding-3-small: ~$0.02 per 1M tokens
- Average chunk (500 tokens): ~$0.00001 per chunk
- 10,000 chunks ≈ $0.10

---

## What's Next

**Phase 5: RAG Ingestion** will add:
- Document upload handling
- Smart chunking strategies
- Metadata extraction
- Background processing pipeline

