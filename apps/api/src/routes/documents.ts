import { Hono } from 'hono';
import { db } from '../db/index.js';
import { documents, documentChunks, eq, desc, sql } from '@insight-os/db-schema';
import {
  ingestText,
  ingestPDF,
  ingestURL,
  getDocumentWithStats,
} from '../services/ingestion.js';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const documentsRoutes = new Hono();

/**
 * GET /documents
 * List all documents
 */
documentsRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const docs = await db
      .select({
        id: documents.id,
        name: documents.name,
        type: documents.type,
        status: documents.status,
        metadata: documents.metadata,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset);

    // Get chunk counts for each document
    const docsWithStats = await Promise.all(
      docs.map(async (doc) => {
        const [stats] = await db
          .select({ count: sql<number>`count(*)` })
          .from(documentChunks)
          .where(eq(documentChunks.documentId, doc.id));

        return { ...doc, chunkCount: Number(stats?.count || 0) };
      })
    );

    return c.json(
      createResponse({
        documents: docsWithStats,
        pagination: { limit, offset },
      })
    );
  } catch (error) {
    console.error('List documents error:', error);
    return c.json(createErrorResponse('Failed to list documents'), 500);
  }
});

/**
 * GET /documents/:id
 * Get document with stats
 */
documentsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const document = await getDocumentWithStats(id);

    if (!document) {
      return c.json(createErrorResponse('Document not found'), 404);
    }

    return c.json(createResponse(document));
  } catch (error) {
    console.error('Get document error:', error);
    return c.json(createErrorResponse('Failed to get document'), 500);
  }
});

/**
 * GET /documents/:id/chunks
 * Get document chunks
 */
documentsRoutes.get('/:id/chunks', async (c) => {
  try {
    const id = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const chunks = await db
      .select({
        id: documentChunks.id,
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        metadata: documentChunks.metadata,
        hasEmbedding: sql<boolean>`embedding IS NOT NULL`,
        createdAt: documentChunks.createdAt,
      })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, id))
      .orderBy(documentChunks.chunkIndex)
      .limit(limit)
      .offset(offset);

    return c.json(
      createResponse({
        chunks,
        pagination: { limit, offset },
      })
    );
  } catch (error) {
    console.error('Get chunks error:', error);
    return c.json(createErrorResponse('Failed to get chunks'), 500);
  }
});

/**
 * POST /documents/text
 * Ingest text content
 */
documentsRoutes.post('/text', async (c) => {
  try {
    const { content, name, options } = await c.req.json<{
      content: string;
      name: string;
      options?: {
        chunkSize?: number;
        chunkOverlap?: number;
        minChunkSize?: number;
        contentType?: 'plain' | 'markdown' | 'code';
        generateEmbeddings?: boolean;
      };
    }>();

    if (!content || !name) {
      return c.json(createErrorResponse('Content and name are required'), 400);
    }

    const result = await ingestText(content, name, {
      chunkOptions: {
        chunkSize: options?.chunkSize,
        chunkOverlap: options?.chunkOverlap,
        minChunkSize: options?.minChunkSize,
      },
      contentType: options?.contentType,
      generateEmbeddings: options?.generateEmbeddings,
    });

    if (result.status === 'failed') {
      return c.json(createErrorResponse(result.error || 'Ingestion failed'), 500);
    }

    return c.json(createResponse(result), 201);
  } catch (error) {
    console.error('Ingest text error:', error);
    return c.json(createErrorResponse('Failed to ingest text'), 500);
  }
});

/**
 * POST /documents/url
 * Ingest from URL
 */
documentsRoutes.post('/url', async (c) => {
  try {
    const { url, options } = await c.req.json<{
      url: string;
      options?: {
        chunkSize?: number;
        chunkOverlap?: number;
        generateEmbeddings?: boolean;
      };
    }>();

    if (!url) {
      return c.json(createErrorResponse('URL is required'), 400);
    }

    const result = await ingestURL(url, {
      chunkOptions: {
        chunkSize: options?.chunkSize,
        chunkOverlap: options?.chunkOverlap,
      },
      generateEmbeddings: options?.generateEmbeddings,
    });

    if (result.status === 'failed') {
      return c.json(createErrorResponse(result.error || 'Ingestion failed'), 500);
    }

    return c.json(createResponse(result), 201);
  } catch (error) {
    console.error('Ingest URL error:', error);
    return c.json(createErrorResponse('Failed to ingest URL'), 500);
  }
});

/**
 * POST /documents/upload
 * Upload file (PDF, TXT, MD)
 */
documentsRoutes.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json(createErrorResponse('File is required'), 400);
    }

    const name = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let result;

    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      result = await ingestPDF(buffer, name);
    } else {
      // Treat as text
      const content = buffer.toString('utf-8');
      const contentType = name.endsWith('.md') ? 'markdown' : 'plain';
      result = await ingestText(content, name, { contentType });
    }

    if (result.status === 'failed') {
      return c.json(createErrorResponse(result.error || 'Upload failed'), 500);
    }

    return c.json(createResponse(result), 201);
  } catch (error) {
    console.error('Upload error:', error);
    return c.json(createErrorResponse('Failed to upload file'), 500);
  }
});

/**
 * DELETE /documents/:id
 * Delete document and its chunks
 */
documentsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Delete chunks first (cascade should handle this, but being explicit)
    await db.delete(documentChunks).where(eq(documentChunks.documentId, id));

    const [deleted] = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();

    if (!deleted) {
      return c.json(createErrorResponse('Document not found'), 404);
    }

    return c.json(createResponse({ deleted: true, id }));
  } catch (error) {
    console.error('Delete document error:', error);
    return c.json(createErrorResponse('Failed to delete document'), 500);
  }
});

