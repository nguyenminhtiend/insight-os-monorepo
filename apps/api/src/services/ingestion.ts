import { db } from '../db/index.js';
import {
  documents,
  documentChunks,
  eq,
  sql,
  type NewDocument,
  type NewDocumentChunk
} from '@insight-os/db-schema';
import { generateEmbeddings } from '../lib/embeddings.js';
import { smartChunk, estimateTokens, type ChunkOptions } from '../lib/chunking.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface IngestionResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  totalTokens: number;
  processingTimeMs: number;
  status: 'completed' | 'failed';
  error?: string;
}

export interface IngestionOptions {
  chunkOptions?: ChunkOptions;
  contentType?: 'plain' | 'markdown' | 'code';
  generateEmbeddings?: boolean;
  batchSize?: number;
}

const DEFAULT_OPTIONS: IngestionOptions = {
  chunkOptions: { chunkSize: 1000, chunkOverlap: 200 },
  contentType: 'plain',
  generateEmbeddings: true,
  batchSize: 20
};

/**
 * Ingest text content into the RAG system
 */
export async function ingestText(
  content: string,
  name: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Create document record
    const [document] = await db
      .insert(documents)
      .values({
        name,
        type: 'text',
        content,
        status: 'processing',
        metadata: {
          wordCount: content.split(/\s+/).length,
          charCount: content.length,
          tokenEstimate: estimateTokens(content)
        }
      })
      .returning();

    // Chunk the content
    const chunks = smartChunk(content, opts.contentType, opts.chunkOptions);
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < chunks.length; i += opts.batchSize!) {
      const batch = chunks.slice(i, i + opts.batchSize!);

      // Generate embeddings for batch
      let embeddings: number[][] | undefined;
      if (opts.generateEmbeddings) {
        embeddings = await generateEmbeddings(batch.map((c) => c.content));
      }

      // Insert chunks
      const chunkRecords: NewDocumentChunk[] = batch.map((chunk, batchIndex) => ({
        documentId: document.id,
        chunkIndex: i + batchIndex,
        content: chunk.content,
        embedding: embeddings?.[batchIndex],
        metadata: chunk.metadata
      }));

      await db.insert(documentChunks).values(chunkRecords);

      totalTokens += batch.reduce((sum, c) => sum + estimateTokens(c.content), 0);
    }

    // Update document status
    await db
      .update(documents)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    return {
      documentId: document.id,
      documentName: name,
      totalChunks: chunks.length,
      totalTokens,
      processingTimeMs: Date.now() - startTime,
      status: 'completed'
    };
  } catch (error) {
    console.error('Ingestion error:', error);
    return {
      documentId: '',
      documentName: name,
      totalChunks: 0,
      totalTokens: 0,
      processingTimeMs: Date.now() - startTime,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Ingest PDF file
 */
export async function ingestPDF(
  buffer: Buffer,
  name: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const startTime = Date.now();

  try {
    // Extract text from PDF
    const pdfData = await pdfParse(buffer);
    const content = pdfData.text;

    // Create document with PDF metadata
    const [document] = await db
      .insert(documents)
      .values({
        name,
        type: 'pdf',
        content,
        status: 'processing',
        metadata: {
          pageCount: pdfData.numpages,
          info: pdfData.info,
          wordCount: content.split(/\s+/).length,
          charCount: content.length
        }
      })
      .returning();

    // Chunk and embed
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const chunks = smartChunk(content, 'plain', opts.chunkOptions);
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i += opts.batchSize!) {
      const batch = chunks.slice(i, i + opts.batchSize!);

      let embeddings: number[][] | undefined;
      if (opts.generateEmbeddings) {
        embeddings = await generateEmbeddings(batch.map((c) => c.content));
      }

      const chunkRecords: NewDocumentChunk[] = batch.map((chunk, batchIndex) => ({
        documentId: document.id,
        chunkIndex: i + batchIndex,
        content: chunk.content,
        embedding: embeddings?.[batchIndex],
        metadata: {
          ...chunk.metadata
          // Could add page number tracking if using more sophisticated PDF parsing
        }
      }));

      await db.insert(documentChunks).values(chunkRecords);
      totalTokens += batch.reduce((sum, c) => sum + estimateTokens(c.content), 0);
    }

    await db
      .update(documents)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    return {
      documentId: document.id,
      documentName: name,
      totalChunks: chunks.length,
      totalTokens,
      processingTimeMs: Date.now() - startTime,
      status: 'completed'
    };
  } catch (error) {
    console.error('PDF ingestion error:', error);
    return {
      documentId: '',
      documentName: name,
      totalChunks: 0,
      totalTokens: 0,
      processingTimeMs: Date.now() - startTime,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Ingest from URL (fetch and process)
 */
export async function ingestURL(
  url: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();

    // Determine content type
    let docType: 'plain' | 'markdown' | 'code' = 'plain';
    if (url.endsWith('.md') || contentType.includes('markdown')) {
      docType = 'markdown';
    } else if (url.match(/\.(ts|js|py|go|rs)$/)) {
      docType = 'code';
    }

    // Extract name from URL
    const urlObj = new URL(url);
    const name = urlObj.pathname.split('/').pop() || urlObj.hostname;

    // Create document
    const [document] = await db
      .insert(documents)
      .values({
        name,
        type: 'url',
        source: url,
        content,
        status: 'processing',
        metadata: {
          url,
          contentType,
          fetchedAt: new Date().toISOString()
        }
      })
      .returning();

    // Chunk and embed
    const opts = { ...DEFAULT_OPTIONS, ...options, contentType: docType };
    const chunks = smartChunk(content, docType, opts.chunkOptions);
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i += opts.batchSize!) {
      const batch = chunks.slice(i, i + opts.batchSize!);

      let embeddings: number[][] | undefined;
      if (opts.generateEmbeddings) {
        embeddings = await generateEmbeddings(batch.map((c) => c.content));
      }

      const chunkRecords: NewDocumentChunk[] = batch.map((chunk, batchIndex) => ({
        documentId: document.id,
        chunkIndex: i + batchIndex,
        content: chunk.content,
        embedding: embeddings?.[batchIndex],
        metadata: chunk.metadata
      }));

      await db.insert(documentChunks).values(chunkRecords);
      totalTokens += batch.reduce((sum, c) => sum + estimateTokens(c.content), 0);
    }

    await db
      .update(documents)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    return {
      documentId: document.id,
      documentName: name,
      totalChunks: chunks.length,
      totalTokens,
      processingTimeMs: Date.now() - startTime,
      status: 'completed'
    };
  } catch (error) {
    console.error('URL ingestion error:', error);
    return {
      documentId: '',
      documentName: url,
      totalChunks: 0,
      totalTokens: 0,
      processingTimeMs: Date.now() - startTime,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get document with chunk count
 */
export async function getDocumentWithStats(documentId: string) {
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));

  if (!document) return null;

  const [chunkStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalChars: sql<number>`sum(length(content))`
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));

  return {
    ...document,
    chunkCount: Number(chunkStats?.count || 0),
    totalChars: Number(chunkStats?.totalChars || 0)
  };
}
