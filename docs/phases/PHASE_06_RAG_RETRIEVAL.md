# Phase 6: RAG Retrieval - Hybrid Search & Semantic Caching

> **Goal:** Implement production-grade retrieval with hybrid search (BM25 + Vector), semantic caching, and RAG-augmented response generation.

---

## Prerequisites

- Phase 5 completed (document ingestion with embeddings)
- Documents ingested with embeddings

---

## Tech Stack Additions

| Tool | Purpose |
|------|---------|
| pg_trgm | PostgreSQL trigram extension for BM25-like search |
| Reciprocal Rank Fusion | Combine vector + keyword scores |
| Semantic Cache | Redis-based similarity cache |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── lib/
│           │   ├── retrieval.ts        # NEW: Retrieval strategies
│           │   └── cache.ts            # NEW: Semantic caching
│           ├── services/
│           │   └── rag.ts              # NEW: RAG pipeline
│           └── routes/
│               └── rag.ts              # NEW: RAG API
```

---

## Implementation Steps

### Step 1: Enable Full-Text Search Extension

**1.1 Run SQL to enable pg_trgm:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN index for full-text search
CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx
ON document_chunks USING gin (content gin_trgm_ops);

-- Add full-text search column
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
ON document_chunks USING gin (content_tsv);
```

---

### Step 2: Create Retrieval Utilities

**2.1 Create `apps/api/src/lib/retrieval.ts`:**

```typescript
import { db } from '../db/index.js';
import { documentChunks, sql } from '@insight-os/db-schema';
import { generateEmbedding } from './embeddings.js';

export interface RetrievalResult {
  id: string;
  content: string;
  documentId: string;
  score: number;
  metadata: Record<string, unknown> | null;
  source: 'vector' | 'keyword' | 'hybrid';
}

export interface RetrievalOptions {
  limit?: number;
  threshold?: number;
  documentIds?: string[];
  useVector?: boolean;
  useKeyword?: boolean;
  vectorWeight?: number;  // 0-1, weight for vector results in hybrid
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  limit: 10,
  threshold: 0.5,
  documentIds: [],
  useVector: true,
  useKeyword: true,
  vectorWeight: 0.7,
};

/**
 * Vector similarity search
 */
export async function vectorSearch(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const documentFilter = opts.documentIds.length > 0
    ? sql`AND document_id = ANY(${opts.documentIds})`
    : sql``;

  const results = await db.execute(sql`
    SELECT
      id,
      content,
      document_id as "documentId",
      metadata,
      1 - (embedding <=> ${vectorStr}::vector) as score
    FROM document_chunks
    WHERE embedding IS NOT NULL
    ${documentFilter}
    AND 1 - (embedding <=> ${vectorStr}::vector) >= ${opts.threshold}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${opts.limit}
  `);

  return (results.rows as any[]).map((row) => ({
    id: row.id,
    content: row.content,
    documentId: row.documentId,
    score: parseFloat(row.score),
    metadata: row.metadata,
    source: 'vector' as const,
  }));
}

/**
 * Full-text keyword search (BM25-like using ts_rank)
 */
export async function keywordSearch(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Convert query to tsquery format
  const tsQuery = query
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .join(' & ');

  const documentFilter = opts.documentIds.length > 0
    ? sql`AND document_id = ANY(${opts.documentIds})`
    : sql``;

  const results = await db.execute(sql`
    SELECT
      id,
      content,
      document_id as "documentId",
      metadata,
      ts_rank(content_tsv, to_tsquery('english', ${tsQuery})) as score
    FROM document_chunks
    WHERE content_tsv @@ to_tsquery('english', ${tsQuery})
    ${documentFilter}
    ORDER BY score DESC
    LIMIT ${opts.limit}
  `);

  // Normalize scores to 0-1 range
  const rows = results.rows as any[];
  const maxScore = rows.length > 0 ? Math.max(...rows.map((r) => r.score)) : 1;

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    documentId: row.documentId,
    score: row.score / maxScore,
    metadata: row.metadata,
    source: 'keyword' as const,
  }));
}

/**
 * Hybrid search using Reciprocal Rank Fusion (RRF)
 */
export async function hybridSearch(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    opts.useVector ? vectorSearch(query, { ...opts, limit: opts.limit * 2 }) : [],
    opts.useKeyword ? keywordSearch(query, { ...opts, limit: opts.limit * 2 }) : [],
  ]);

  // Create rank maps
  const vectorRanks = new Map<string, number>();
  const keywordRanks = new Map<string, number>();
  const contentMap = new Map<string, RetrievalResult>();

  vectorResults.forEach((r, i) => {
    vectorRanks.set(r.id, i + 1);
    contentMap.set(r.id, r);
  });

  keywordResults.forEach((r, i) => {
    keywordRanks.set(r.id, i + 1);
    if (!contentMap.has(r.id)) {
      contentMap.set(r.id, r);
    }
  });

  // Calculate RRF scores
  const k = 60; // RRF constant
  const rrfScores: Array<{ id: string; score: number }> = [];

  for (const id of contentMap.keys()) {
    const vectorRank = vectorRanks.get(id);
    const keywordRank = keywordRanks.get(id);

    let score = 0;
    if (vectorRank) {
      score += opts.vectorWeight * (1 / (k + vectorRank));
    }
    if (keywordRank) {
      score += (1 - opts.vectorWeight) * (1 / (k + keywordRank));
    }

    rrfScores.push({ id, score });
  }

  // Sort by RRF score and take top results
  rrfScores.sort((a, b) => b.score - a.score);
  const topIds = rrfScores.slice(0, opts.limit);

  // Normalize scores
  const maxScore = topIds.length > 0 ? topIds[0].score : 1;

  return topIds.map(({ id, score }) => {
    const result = contentMap.get(id)!;
    return {
      ...result,
      score: score / maxScore,
      source: 'hybrid' as const,
    };
  });
}

/**
 * Smart retrieval - automatically picks best strategy
 */
export async function retrieve(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // If both enabled, use hybrid
  if (opts.useVector && opts.useKeyword) {
    return hybridSearch(query, opts);
  }

  // If only vector
  if (opts.useVector) {
    return vectorSearch(query, opts);
  }

  // If only keyword
  return keywordSearch(query, opts);
}
```

---

### Step 3: Create Semantic Caching

**3.1 Create `apps/api/src/lib/cache.ts`:**

```typescript
import { redis, cacheHelpers } from './redis.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';

const CACHE_PREFIX = 'semantic:';
const CACHE_TTL = 3600; // 1 hour
const SIMILARITY_THRESHOLD = 0.95;

interface CachedResponse {
  query: string;
  queryEmbedding: number[];
  response: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Get semantically similar cached response
 */
export async function getSemanticCache(
  query: string
): Promise<{ hit: boolean; response?: string; similarity?: number }> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Get all cache keys
    const keys = await redis.keys(`${CACHE_PREFIX}*`);

    if (keys.length === 0) {
      return { hit: false };
    }

    // Check each cached item for similarity
    let bestMatch: { response: string; similarity: number } | null = null;

    for (const key of keys) {
      const cached = await cacheHelpers.get<CachedResponse>(key);
      if (!cached) continue;

      const similarity = cosineSimilarity(queryEmbedding, cached.queryEmbedding);

      if (similarity >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = {
            response: cached.response,
            similarity,
          };
        }
      }
    }

    if (bestMatch) {
      return {
        hit: true,
        response: bestMatch.response,
        similarity: bestMatch.similarity,
      };
    }

    return { hit: false };
  } catch (error) {
    console.error('Semantic cache error:', error);
    return { hit: false };
  }
}

/**
 * Store response in semantic cache
 */
export async function setSemanticCache(
  query: string,
  response: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const cacheKey = `${CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const cached: CachedResponse = {
      query,
      queryEmbedding,
      response,
      metadata,
      timestamp: Date.now(),
    };

    await cacheHelpers.set(cacheKey, cached, CACHE_TTL);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Clear semantic cache
 */
export async function clearSemanticCache(): Promise<number> {
  return cacheHelpers.deletePattern(`${CACHE_PREFIX}*`);
}

/**
 * Get cache stats
 */
export async function getCacheStats(): Promise<{
  entries: number;
  oldestTimestamp?: number;
  newestTimestamp?: number;
}> {
  const keys = await redis.keys(`${CACHE_PREFIX}*`);

  if (keys.length === 0) {
    return { entries: 0 };
  }

  let oldest = Infinity;
  let newest = 0;

  for (const key of keys) {
    const cached = await cacheHelpers.get<CachedResponse>(key);
    if (cached) {
      oldest = Math.min(oldest, cached.timestamp);
      newest = Math.max(newest, cached.timestamp);
    }
  }

  return {
    entries: keys.length,
    oldestTimestamp: oldest === Infinity ? undefined : oldest,
    newestTimestamp: newest === 0 ? undefined : newest,
  };
}
```

---

### Step 4: Create RAG Service

**4.1 Create `apps/api/src/services/rag.ts`:**

```typescript
import { streamText, generateText } from 'ai';
import { openai, MODELS } from '../lib/ai.js';
import { retrieve, type RetrievalOptions, type RetrievalResult } from '../lib/retrieval.js';
import { getSemanticCache, setSemanticCache } from '../lib/cache.js';

export interface RAGOptions extends RetrievalOptions {
  model?: string;
  systemPrompt?: string;
  useCache?: boolean;
  includeContext?: boolean;  // Include retrieved chunks in response
}

export interface RAGResponse {
  answer: string;
  context: RetrievalResult[];
  cached: boolean;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are InsightOS, a strategic market intelligence assistant.
Answer questions based on the provided context. If the context doesn't contain relevant information,
say so clearly. Be concise and data-driven.

Guidelines:
- Use information from the context to support your answers
- Cite specific details when available
- If uncertain, indicate your confidence level
- Don't make up information not in the context`;

/**
 * RAG query - retrieve and generate
 */
export async function ragQuery(
  query: string,
  options: RAGOptions = {}
): Promise<RAGResponse> {
  const {
    model = MODELS.smart,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    useCache = true,
    includeContext = true,
    ...retrievalOptions
  } = options;

  // Check semantic cache first
  if (useCache) {
    const cached = await getSemanticCache(query);
    if (cached.hit && cached.response) {
      return {
        answer: cached.response,
        context: [],
        cached: true,
        model: 'cache',
      };
    }
  }

  // Retrieve relevant context
  const context = await retrieve(query, retrievalOptions);

  // Build context string
  const contextStr = context
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');

  // Generate response
  const prompt = contextStr
    ? `Context:\n${contextStr}\n\nQuestion: ${query}`
    : query;

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  // Cache the response
  if (useCache) {
    await setSemanticCache(query, result.text, {
      contextCount: context.length,
      model,
    });
  }

  return {
    answer: result.text,
    context: includeContext ? context : [],
    cached: false,
    model,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

/**
 * Streaming RAG query
 */
export async function ragQueryStream(
  query: string,
  options: RAGOptions = {}
): Promise<{
  stream: AsyncIterable<string>;
  context: RetrievalResult[];
  model: string;
}> {
  const {
    model = MODELS.smart,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    ...retrievalOptions
  } = options;

  // Retrieve context
  const context = await retrieve(query, retrievalOptions);

  // Build context string
  const contextStr = context
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');

  const prompt = contextStr
    ? `Context:\n${contextStr}\n\nQuestion: ${query}`
    : query;

  // Stream response
  const result = streamText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return {
    stream: result.textStream,
    context,
    model,
  };
}

/**
 * Multi-query RAG - generate multiple query variations for better retrieval
 */
export async function multiQueryRAG(
  query: string,
  options: RAGOptions = {}
): Promise<RAGResponse> {
  const { model = MODELS.smart, ...retrievalOptions } = options;

  // Generate query variations
  const variationsResult = await generateText({
    model: openai(MODELS.fast),
    prompt: `Generate 3 different variations of this search query to improve retrieval.
Return only the variations, one per line.

Original query: "${query}"`,
    temperature: 0.7,
    maxTokens: 200,
  });

  const variations = [query, ...variationsResult.text.split('\n').filter((v) => v.trim())];

  // Retrieve for each variation
  const allResults: RetrievalResult[] = [];
  const seen = new Set<string>();

  for (const variation of variations.slice(0, 4)) {
    const results = await retrieve(variation, { ...retrievalOptions, limit: 5 });
    for (const result of results) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        allResults.push(result);
      }
    }
  }

  // Sort by score and take top results
  allResults.sort((a, b) => b.score - a.score);
  const topContext = allResults.slice(0, retrievalOptions.limit || 10);

  // Generate final response
  const contextStr = topContext
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');

  const result = await generateText({
    model: openai(model),
    system: DEFAULT_SYSTEM_PROMPT,
    prompt: `Context:\n${contextStr}\n\nQuestion: ${query}`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return {
    answer: result.text,
    context: topContext,
    cached: false,
    model,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}
```

---

### Step 5: Create RAG API Routes

**5.1 Create `apps/api/src/routes/rag.ts`:**

```typescript
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { retrieve } from '../lib/retrieval.js';
import { ragQuery, ragQueryStream, multiQueryRAG } from '../services/rag.js';
import { getCacheStats, clearSemanticCache } from '../lib/cache.js';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const ragRoutes = new Hono();

/**
 * POST /rag/query
 * RAG query with retrieval
 */
ragRoutes.post('/query', async (c) => {
  try {
    const {
      query,
      limit = 10,
      threshold = 0.5,
      documentIds,
      useCache = true,
      useVector = true,
      useKeyword = true,
    } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
      useCache?: boolean;
      useVector?: boolean;
      useKeyword?: boolean;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const result = await ragQuery(query, {
      limit,
      threshold,
      documentIds,
      useCache,
      useVector,
      useKeyword,
    });

    return c.json(createResponse(result));
  } catch (error) {
    console.error('RAG query error:', error);
    return c.json(createErrorResponse('Query failed'), 500);
  }
});

/**
 * POST /rag/query/stream
 * Streaming RAG query
 */
ragRoutes.post('/query/stream', async (c) => {
  try {
    const { query, limit = 10, threshold = 0.5, documentIds } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const { stream: textStream, context, model } = await ragQueryStream(query, {
      limit,
      threshold,
      documentIds,
    });

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      // Send context first
      await stream.write(`data: ${JSON.stringify({ type: 'context', context })}\n\n`);

      // Stream response
      for await (const chunk of textStream) {
        await stream.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
      }

      await stream.write(`data: ${JSON.stringify({ type: 'done', model })}\n\n`);
    });
  } catch (error) {
    console.error('RAG stream error:', error);
    return c.json(createErrorResponse('Stream failed'), 500);
  }
});

/**
 * POST /rag/query/multi
 * Multi-query RAG for better retrieval
 */
ragRoutes.post('/query/multi', async (c) => {
  try {
    const { query, limit = 10, threshold = 0.5, documentIds } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const result = await multiQueryRAG(query, {
      limit,
      threshold,
      documentIds,
    });

    return c.json(createResponse(result));
  } catch (error) {
    console.error('Multi-query RAG error:', error);
    return c.json(createErrorResponse('Query failed'), 500);
  }
});

/**
 * POST /rag/retrieve
 * Retrieve without generation (for debugging)
 */
ragRoutes.post('/retrieve', async (c) => {
  try {
    const {
      query,
      limit = 10,
      threshold = 0.5,
      documentIds,
      useVector = true,
      useKeyword = true,
      vectorWeight = 0.7,
    } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
      useVector?: boolean;
      useKeyword?: boolean;
      vectorWeight?: number;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const results = await retrieve(query, {
      limit,
      threshold,
      documentIds,
      useVector,
      useKeyword,
      vectorWeight,
    });

    return c.json(createResponse({
      query,
      results,
      count: results.length,
    }));
  } catch (error) {
    console.error('Retrieve error:', error);
    return c.json(createErrorResponse('Retrieval failed'), 500);
  }
});

/**
 * GET /rag/cache/stats
 * Get semantic cache statistics
 */
ragRoutes.get('/cache/stats', async (c) => {
  try {
    const stats = await getCacheStats();
    return c.json(createResponse(stats));
  } catch (error) {
    console.error('Cache stats error:', error);
    return c.json(createErrorResponse('Failed to get cache stats'), 500);
  }
});

/**
 * DELETE /rag/cache
 * Clear semantic cache
 */
ragRoutes.delete('/cache', async (c) => {
  try {
    const cleared = await clearSemanticCache();
    return c.json(createResponse({ cleared }));
  } catch (error) {
    console.error('Cache clear error:', error);
    return c.json(createErrorResponse('Failed to clear cache'), 500);
  }
});
```

**5.2 Update main entry to include RAG routes.**

---

## Demo Checklist

- [ ] Hybrid search returns results from both vector and keyword
- [ ] Vector-only search works
- [ ] Keyword-only search works
- [ ] Semantic cache hits on similar queries
- [ ] Cache can be cleared
- [ ] RAG generates contextual answers
- [ ] Streaming RAG works
- [ ] Multi-query RAG improves recall

---

## API Testing

```bash
# RAG query
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is Tesla known for?"}'

# Streaming RAG
curl -X POST http://localhost:3001/rag/query/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about electric vehicles"}'

# Multi-query RAG
curl -X POST http://localhost:3001/rag/query/multi \
  -H "Content-Type: application/json" \
  -d '{"query": "EV market trends"}'

# Retrieve only (no generation)
curl -X POST http://localhost:3001/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query": "Tesla", "useVector": true, "useKeyword": true}'

# Cache stats
curl http://localhost:3001/rag/cache/stats

# Clear cache
curl -X DELETE http://localhost:3001/rag/cache
```

---

## What's Next

**Phase 7: RAG Advanced** will add:
- Reranking with cross-encoder models
- Query reformulation for follow-up questions
- Contextual retrieval with document metadata

