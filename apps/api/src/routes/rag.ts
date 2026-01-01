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
    const {
      query,
      limit = 10,
      threshold = 0.5,
      documentIds,
    } = await c.req.json<{
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
      await stream.write(
        `data: ${JSON.stringify({ type: 'context', context })}\n\n`
      );

      // Stream response
      for await (const chunk of textStream) {
        await stream.write(
          `data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`
        );
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
      documentIds,
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

    return c.json(
      createResponse({
        query,
        results,
        count: results.length,
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

