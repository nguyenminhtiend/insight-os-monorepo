import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { retrieve } from '../lib/retrieval.js';
import { ragQuery, ragQueryStream, multiQueryRAG, advancedRAGQuery } from '../services/rag.js';
import { getCacheStats, clearSemanticCache } from '../lib/cache.js';
import { rerank } from '../lib/reranker.js';
import { reformulateQuery } from '../lib/query.js';
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
      useKeyword = true
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
      useKeyword
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
    const {
      query,
      limit = 10,
      threshold = 0.5,
      documentIds
    } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentIds?: string[];
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const {
      stream: textStream,
      context,
      model
    } = await ragQueryStream(query, {
      limit,
      threshold,
      documentIds
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
    const {
      query,
      limit = 10,
      threshold = 0.5,
      documentIds
    } = await c.req.json<{
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
      documentIds
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
      vectorWeight = 0.7
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
      vectorWeight
    });

    return c.json(
      createResponse({
        query,
        results,
        count: results.length
      })
    );
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
      conversationContext
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
      conversationContext
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
    const {
      query,
      results,
      topK = 5
    } = await c.req.json<{
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
        source: 'hybrid' as const
      })),
      { topK }
    );

    return c.json(
      createResponse({
        query,
        results: reranked,
        count: reranked.length
      })
    );
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

    return c.json(
      createResponse({
        original: query,
        reformulated,
        wasChanged: reformulated !== query
      })
    );
  } catch (error) {
    console.error('Reformulate error:', error);
    return c.json(createErrorResponse('Reformulation failed'), 500);
  }
});
