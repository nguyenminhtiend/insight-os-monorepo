# Phase 7: RAG Advanced - Reranking & Query Reformulation

> **Goal:** Enhance RAG quality with cross-encoder reranking, history-aware query reformulation, and contextual retrieval.

---

## Prerequisites

- Phase 6 completed (hybrid search + semantic caching)
- Understanding of reranking concepts

---

## Tech Stack Additions

| Tool | Purpose |
|------|---------|
| Cohere Rerank API | Cross-encoder reranking |
| Query reformulation | History-aware query rewriting |
| Contextual retrieval | Document metadata enrichment |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── lib/
│           │   ├── reranker.ts         # NEW: Reranking logic
│           │   └── query.ts            # NEW: Query reformulation
│           └── services/
│               └── rag.ts              # UPDATED: Add reranking pipeline
```

---

## Implementation Steps

### Step 1: Create Reranker

**1.1 Install Cohere SDK (or use OpenAI for reranking):**

```bash
cd apps/api
pnpm add cohere-ai
```

**1.2 Create `apps/api/src/lib/reranker.ts`:**

```typescript
import { CohereClient } from 'cohere-ai';
import { generateText } from 'ai';
import { openai, MODELS } from './ai.js';
import type { RetrievalResult } from './retrieval.js';

// Initialize Cohere (optional - fallback to LLM-based reranking)
const cohere = process.env.COHERE_API_KEY
  ? new CohereClient({ token: process.env.COHERE_API_KEY })
  : null;

export interface RerankOptions {
  topK?: number;
  model?: 'cohere' | 'llm';
  threshold?: number;
}

export interface RerankResult extends RetrievalResult {
  rerankScore: number;
  originalScore: number;
}

/**
 * Rerank results using Cohere's cross-encoder
 */
async function cohereRerank(
  query: string,
  results: RetrievalResult[],
  topK: number
): Promise<RerankResult[]> {
  if (!cohere) {
    throw new Error('Cohere API key not configured');
  }

  const response = await cohere.rerank({
    model: 'rerank-english-v3.0',
    query,
    documents: results.map((r) => r.content),
    topN: topK,
    returnDocuments: false,
  });

  return response.results.map((r) => ({
    ...results[r.index],
    rerankScore: r.relevanceScore,
    originalScore: results[r.index].score,
  }));
}

/**
 * Rerank results using LLM scoring (fallback)
 */
async function llmRerank(
  query: string,
  results: RetrievalResult[],
  topK: number
): Promise<RerankResult[]> {
  // Score each result with LLM
  const scoringPromises = results.map(async (result, index) => {
    const response = await generateText({
      model: openai(MODELS.fast),
      prompt: `Rate how relevant this passage is to the query on a scale of 0-10.
Only respond with a single number.

Query: "${query}"

Passage: "${result.content.slice(0, 500)}"

Relevance score (0-10):`,
      temperature: 0,
      maxTokens: 5,
    });

    const score = parseFloat(response.text.trim()) || 0;
    return {
      ...result,
      rerankScore: score / 10,
      originalScore: result.score,
    };
  });

  const scored = await Promise.all(scoringPromises);

  // Sort by rerank score and take top K
  return scored
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

/**
 * Rerank retrieval results
 */
export async function rerank(
  query: string,
  results: RetrievalResult[],
  options: RerankOptions = {}
): Promise<RerankResult[]> {
  const {
    topK = 5,
    model = cohere ? 'cohere' : 'llm',
    threshold = 0,
  } = options;

  if (results.length === 0) {
    return [];
  }

  // If few results, skip reranking
  if (results.length <= topK) {
    return results.map((r) => ({
      ...r,
      rerankScore: r.score,
      originalScore: r.score,
    }));
  }

  let reranked: RerankResult[];

  if (model === 'cohere' && cohere) {
    reranked = await cohereRerank(query, results, topK);
  } else {
    reranked = await llmRerank(query, results, topK);
  }

  // Filter by threshold
  return reranked.filter((r) => r.rerankScore >= threshold);
}

/**
 * Batch rerank for multiple queries
 */
export async function batchRerank(
  queries: Array<{ query: string; results: RetrievalResult[] }>,
  options: RerankOptions = {}
): Promise<Map<string, RerankResult[]>> {
  const results = await Promise.all(
    queries.map(async ({ query, results }) => ({
      query,
      reranked: await rerank(query, results, options),
    }))
  );

  return new Map(results.map((r) => [r.query, r.reranked]));
}
```

---

### Step 2: Create Query Reformulation

**2.1 Create `apps/api/src/lib/query.ts`:**

```typescript
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { openai, MODELS } from './ai.js';

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Reformulate query based on conversation history
 * Handles pronouns and implicit references
 */
export async function reformulateQuery(
  query: string,
  context?: ConversationContext
): Promise<string> {
  // If no context, return original query
  if (!context || context.messages.length === 0) {
    return query;
  }

  // Build conversation history
  const history = context.messages
    .slice(-6) // Last 3 exchanges
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Given this conversation history and a new query, rewrite the query to be self-contained.
Replace pronouns and references with their actual subjects.
If the query is already self-contained, return it unchanged.
Only return the reformulated query, nothing else.

Conversation:
${history}

New query: "${query}"

Reformulated query:`,
    temperature: 0,
    maxTokens: 200,
  });

  return result.text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Expand query with related terms
 */
export async function expandQuery(query: string): Promise<string[]> {
  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Generate 3 search query variations for better information retrieval.
Include synonyms and related concepts.
Return only the queries, one per line.

Original: "${query}"

Variations:`,
    temperature: 0.7,
    maxTokens: 150,
  });

  const variations = result.text
    .split('\n')
    .map((v) => v.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((v) => v.length > 0);

  return [query, ...variations];
}

/**
 * Decompose complex query into sub-queries
 */
export async function decomposeQuery(query: string): Promise<string[]> {
  const schema = z.object({
    isComplex: z.boolean(),
    subQueries: z.array(z.string()),
  });

  const { object } = await generateObject({
    model: openai(MODELS.fast),
    schema,
    prompt: `Analyze if this query requires multiple pieces of information.
If so, decompose it into simpler sub-queries.
If the query is simple, return it as-is.

Query: "${query}"`,
    temperature: 0,
  });

  if (!object.isComplex || object.subQueries.length === 0) {
    return [query];
  }

  return object.subQueries;
}

/**
 * Detect query intent for routing
 */
export async function detectIntent(query: string): Promise<{
  intent: 'factual' | 'analytical' | 'comparative' | 'exploratory' | 'procedural';
  confidence: number;
  entities: string[];
}> {
  const schema = z.object({
    intent: z.enum(['factual', 'analytical', 'comparative', 'exploratory', 'procedural']),
    confidence: z.number().min(0).max(1),
    entities: z.array(z.string()),
  });

  const { object } = await generateObject({
    model: openai(MODELS.fast),
    schema,
    prompt: `Classify the intent of this query and extract key entities.

Intents:
- factual: Looking for specific facts or data
- analytical: Requires analysis or interpretation
- comparative: Comparing multiple items
- exploratory: Open-ended exploration
- procedural: How-to or step-by-step

Query: "${query}"`,
    temperature: 0,
  });

  return object;
}

/**
 * Hypothetical Document Embedding (HyDE)
 * Generate a hypothetical answer to use for retrieval
 */
export async function generateHypotheticalAnswer(query: string): Promise<string> {
  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Write a short, factual paragraph that would answer this question.
This will be used for semantic search, so include relevant keywords.

Question: "${query}"

Answer:`,
    temperature: 0.3,
    maxTokens: 200,
  });

  return result.text.trim();
}
```

---

### Step 3: Update RAG Service with Advanced Features

**3.1 Update `apps/api/src/services/rag.ts`:**

```typescript
import { streamText, generateText } from 'ai';
import { openai, MODELS } from '../lib/ai.js';
import { retrieve, type RetrievalOptions, type RetrievalResult } from '../lib/retrieval.js';
import { rerank, type RerankResult } from '../lib/reranker.js';
import { reformulateQuery, expandQuery, generateHypotheticalAnswer, type ConversationContext } from '../lib/query.js';
import { getSemanticCache, setSemanticCache } from '../lib/cache.js';

export interface AdvancedRAGOptions extends RetrievalOptions {
  model?: string;
  systemPrompt?: string;
  useCache?: boolean;
  useReranking?: boolean;
  useQueryReformulation?: boolean;
  useHyDE?: boolean;
  conversationContext?: ConversationContext;
}

export interface AdvancedRAGResponse {
  answer: string;
  context: RerankResult[];
  originalQuery: string;
  reformulatedQuery?: string;
  cached: boolean;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: {
    rerankingUsed: boolean;
    queryReformulated: boolean;
    hydeUsed: boolean;
    retrievalCount: number;
    rerankCount: number;
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are InsightOS, a strategic market intelligence assistant.
Answer questions based on the provided context. Be precise and cite information when possible.

Guidelines:
- Base answers on the provided context
- If context is insufficient, acknowledge limitations
- Be concise but thorough
- Use bullet points for multiple items`;

/**
 * Advanced RAG with reranking and query reformulation
 */
export async function advancedRAGQuery(
  query: string,
  options: AdvancedRAGOptions = {}
): Promise<AdvancedRAGResponse> {
  const {
    model = MODELS.smart,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    useCache = true,
    useReranking = true,
    useQueryReformulation = true,
    useHyDE = false,
    conversationContext,
    limit = 20, // Retrieve more for reranking
    ...retrievalOptions
  } = options;

  // Step 1: Query Reformulation
  let searchQuery = query;
  let wasReformulated = false;

  if (useQueryReformulation && conversationContext) {
    searchQuery = await reformulateQuery(query, conversationContext);
    wasReformulated = searchQuery !== query;
  }

  // Check cache with reformulated query
  if (useCache) {
    const cached = await getSemanticCache(searchQuery);
    if (cached.hit && cached.response) {
      return {
        answer: cached.response,
        context: [],
        originalQuery: query,
        reformulatedQuery: wasReformulated ? searchQuery : undefined,
        cached: true,
        model: 'cache',
        metadata: {
          rerankingUsed: false,
          queryReformulated: wasReformulated,
          hydeUsed: false,
          retrievalCount: 0,
          rerankCount: 0,
        },
      };
    }
  }

  // Step 2: Optional HyDE
  let retrievalQuery = searchQuery;
  let hydeUsed = false;

  if (useHyDE) {
    const hypothetical = await generateHypotheticalAnswer(searchQuery);
    retrievalQuery = hypothetical;
    hydeUsed = true;
  }

  // Step 3: Retrieval
  const retrievedResults = await retrieve(retrievalQuery, {
    ...retrievalOptions,
    limit: useReranking ? limit : (options.limit || 10),
  });

  // Step 4: Reranking
  let finalContext: RerankResult[];

  if (useReranking && retrievedResults.length > 0) {
    finalContext = await rerank(searchQuery, retrievedResults, {
      topK: options.limit || 5,
      threshold: 0.3,
    });
  } else {
    finalContext = retrievedResults.map((r) => ({
      ...r,
      rerankScore: r.score,
      originalScore: r.score,
    }));
  }

  // Step 5: Generate Response
  const contextStr = finalContext
    .map((c, i) => `[${i + 1}] (relevance: ${(c.rerankScore * 100).toFixed(0)}%) ${c.content}`)
    .join('\n\n');

  const prompt = contextStr
    ? `Context:\n${contextStr}\n\nQuestion: ${searchQuery}`
    : searchQuery;

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  // Cache the response
  if (useCache) {
    await setSemanticCache(searchQuery, result.text, {
      contextCount: finalContext.length,
      model,
      reranked: useReranking,
    });
  }

  return {
    answer: result.text,
    context: finalContext,
    originalQuery: query,
    reformulatedQuery: wasReformulated ? searchQuery : undefined,
    cached: false,
    model,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
    metadata: {
      rerankingUsed: useReranking,
      queryReformulated: wasReformulated,
      hydeUsed,
      retrievalCount: retrievedResults.length,
      rerankCount: finalContext.length,
    },
  };
}

// Export existing functions for backward compatibility
export { ragQuery, ragQueryStream, multiQueryRAG } from './rag-basic.js';
```

---

### Step 4: Add Advanced RAG Routes

**4.1 Update `apps/api/src/routes/rag.ts` with new endpoints:**

```typescript
// Add to existing rag.ts

/**
 * POST /rag/query/advanced
 * Advanced RAG with reranking and query reformulation
 */
ragRoutes.post('/query/advanced', async (c) => {
  try {
    const {
      query,
      limit = 5,
      threshold = 0.5,
      documentIds,
      useCache = true,
      useReranking = true,
      useQueryReformulation = true,
      useHyDE = false,
      conversationContext,
    } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
      useCache?: boolean;
      useReranking?: boolean;
      useQueryReformulation?: boolean;
      useHyDE?: boolean;
      conversationContext?: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      };
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const result = await advancedRAGQuery(query, {
      limit,
      threshold,
      documentIds,
      useCache,
      useReranking,
      useQueryReformulation,
      useHyDE,
      conversationContext,
    });

    return c.json(createResponse(result));
  } catch (error) {
    console.error('Advanced RAG error:', error);
    return c.json(createErrorResponse('Query failed'), 500);
  }
});

/**
 * POST /rag/rerank
 * Standalone reranking endpoint
 */
ragRoutes.post('/rerank', async (c) => {
  try {
    const { query, results, topK = 5 } = await c.req.json<{
      query: string;
      results: Array<{ id: string; content: string; score: number }>;
      topK?: number;
    }>();

    if (!query || !results) {
      return c.json(createErrorResponse('Query and results are required'), 400);
    }

    const reranked = await rerank(
      query,
      results.map((r) => ({
        ...r,
        documentId: '',
        metadata: null,
        source: 'hybrid' as const,
      })),
      { topK }
    );

    return c.json(createResponse({
      query,
      results: reranked,
      count: reranked.length,
    }));
  } catch (error) {
    console.error('Rerank error:', error);
    return c.json(createErrorResponse('Reranking failed'), 500);
  }
});

/**
 * POST /rag/reformulate
 * Query reformulation endpoint
 */
ragRoutes.post('/reformulate', async (c) => {
  try {
    const { query, conversationContext } = await c.req.json<{
      query: string;
      conversationContext?: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      };
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const reformulated = await reformulateQuery(query, conversationContext);

    return c.json(createResponse({
      original: query,
      reformulated,
      wasChanged: reformulated !== query,
    }));
  } catch (error) {
    console.error('Reformulate error:', error);
    return c.json(createErrorResponse('Reformulation failed'), 500);
  }
});

import { advancedRAGQuery } from '../services/rag.js';
import { rerank } from '../lib/reranker.js';
import { reformulateQuery } from '../lib/query.js';
```

---

## Demo Checklist

- [ ] Reranking improves result quality
- [ ] Query reformulation handles pronouns correctly
- [ ] HyDE improves retrieval for abstract queries
- [ ] Conversation context is used for follow-up questions
- [ ] Standalone reranking endpoint works
- [ ] Query reformulation endpoint works

---

## API Testing

```bash
# Advanced RAG query
curl -X POST http://localhost:3001/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are their main products?",
    "useReranking": true,
    "useQueryReformulation": true,
    "conversationContext": {
      "messages": [
        {"role": "user", "content": "Tell me about Tesla"},
        {"role": "assistant", "content": "Tesla is an electric vehicle company..."}
      ]
    }
  }'

# Test reranking
curl -X POST http://localhost:3001/rag/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "electric vehicles",
    "results": [
      {"id": "1", "content": "Tesla makes cars", "score": 0.8},
      {"id": "2", "content": "Electric vehicles are growing", "score": 0.7}
    ]
  }'

# Test query reformulation
curl -X POST http://localhost:3001/rag/reformulate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are their competitors?",
    "conversationContext": {
      "messages": [{"role": "user", "content": "Tell me about Apple"}]
    }
  }'
```

---

## What's Next

**Phase 8: Agents Intro** will add:
- LangGraph setup
- Basic tool calling
- Simple agent workflow

