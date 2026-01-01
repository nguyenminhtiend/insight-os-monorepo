import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  documents,
  documentChunks,
  eq,
  sql,
  type NewDocument,
  type NewDocumentChunk
} from '@insight-os/db-schema';
import {
  generateEmbedding,
  generateEmbeddings,
  searchByText,
  getEmbeddingStats
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

    return c.json(
      createResponse({
        embedding,
        dimensions: embedding.length,
        model: 'text-embedding-3-small'
      })
    );
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

    return c.json(
      createResponse({
        embeddings,
        count: embeddings.length,
        dimensions: embeddings[0]?.length || 0
      })
    );
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
    const {
      query,
      limit = 10,
      threshold = 0.7,
      documentId
    } = await c.req.json<{
      query: string;
      limit?: number;
      threshold?: number;
      documentId?: string;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const results = await searchByText(query, { limit, threshold, documentId });

    return c.json(
      createResponse({
        results,
        query,
        count: results.length
      })
    );
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
        metadata
      })
      .returning();

    return c.json(
      createResponse({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        embeddingDimensions: embedding.length
      }),
      201
    );
  } catch (error) {
    console.error('Store error:', error);
    return c.json(createErrorResponse('Failed to store content'), 500);
  }
});

/**
 * POST /embeddings/documents
 * Create a test document
 */
embeddingsRoutes.post('/documents', async (c) => {
  try {
    const { name, type, content, metadata } = await c.req.json<{
      name: string;
      type: string;
      content?: string;
      metadata?: Record<string, unknown>;
    }>();

    if (!name || !type) {
      return c.json(createErrorResponse('Name and type are required'), 400);
    }

    const [document] = await db
      .insert(documents)
      .values({
        name,
        type,
        content,
        status: 'completed',
        metadata
      })
      .returning();

    return c.json(createResponse(document), 201);
  } catch (error) {
    console.error('Create document error:', error);
    return c.json(createErrorResponse('Failed to create document'), 500);
  }
});

/**
 * GET /embeddings/documents
 * List all documents
 */
embeddingsRoutes.get('/documents', async (c) => {
  try {
    const allDocuments = await db.select().from(documents);
    return c.json(createResponse(allDocuments));
  } catch (error) {
    console.error('List documents error:', error);
    return c.json(createErrorResponse('Failed to list documents'), 500);
  }
});
