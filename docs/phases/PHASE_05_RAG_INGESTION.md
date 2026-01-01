# Phase 5: RAG Ingestion - Document Processing & Chunking

> **Goal:** Build a document ingestion pipeline with smart chunking strategies, metadata extraction, and embedding generation.

---

## Prerequisites

- Phase 4 completed (vector search with pgvector)
- Understanding of text chunking strategies

---

## Tech Stack Additions

| Tool | Purpose |
|------|---------|
| pdf-parse | PDF text extraction |
| Recursive chunking | Smart text splitting |
| Metadata extraction | Document context enrichment |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── lib/
│           │   ├── embeddings.ts
│           │   └── chunking.ts         # NEW: Chunking strategies
│           ├── services/
│           │   └── ingestion.ts        # NEW: Ingestion service
│           └── routes/
│               └── documents.ts        # NEW: Document API
```

---

## Implementation Steps

### Step 1: Create Chunking Utilities

**1.1 Install dependencies:**

```bash
cd apps/api
pnpm add pdf-parse
pnpm add -D @types/pdf-parse
```

**1.2 Create `apps/api/src/lib/chunking.ts`:**

```typescript
export interface ChunkOptions {
  chunkSize?: number;        // Target chunk size in characters
  chunkOverlap?: number;     // Overlap between chunks
  minChunkSize?: number;     // Minimum chunk size
  separators?: string[];     // Custom separators
}

export interface Chunk {
  content: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    wordCount: number;
    charCount: number;
  };
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  chunkSize: 1000,
  chunkOverlap: 200,
  minChunkSize: 100,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '],
};

/**
 * Split text into chunks using recursive character splitting
 * Preserves semantic boundaries (paragraphs > sentences > phrases)
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  const splitRecursively = (
    text: string,
    separators: string[],
    startOffset: number
  ): string[] => {
    if (text.length <= opts.chunkSize) {
      return [text];
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (!separator || remainingSeparators.length === 0) {
      // No more separators, force split
      return forceSplit(text, opts.chunkSize);
    }

    const splits = text.split(separator);
    const results: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const candidate = currentChunk
        ? currentChunk + separator + split
        : split;

      if (candidate.length <= opts.chunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) {
          results.push(currentChunk);
        }

        if (split.length > opts.chunkSize) {
          // Recursively split with next separator
          const subChunks = splitRecursively(split, remainingSeparators, 0);
          results.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk) {
      results.push(currentChunk);
    }

    return results;
  };

  const rawChunks = splitRecursively(text, opts.separators, 0);

  // Add overlap and create chunk objects
  let currentOffset = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    let chunkContent = rawChunks[i];

    // Add overlap from previous chunk
    if (i > 0 && opts.chunkOverlap > 0) {
      const previousChunk = rawChunks[i - 1];
      const overlapText = previousChunk.slice(-opts.chunkOverlap);
      chunkContent = overlapText + chunkContent;
    }

    // Skip chunks that are too small
    if (chunkContent.length < opts.minChunkSize) {
      continue;
    }

    const chunkStartChar = Math.max(0, currentOffset - (i > 0 ? opts.chunkOverlap : 0));

    chunks.push({
      content: chunkContent.trim(),
      index: chunks.length,
      metadata: {
        startChar: chunkStartChar,
        endChar: chunkStartChar + chunkContent.length,
        wordCount: chunkContent.split(/\s+/).length,
        charCount: chunkContent.length,
      },
    });

    currentOffset += rawChunks[i].length;
  }

  return chunks;
}

/**
 * Force split text at exact positions
 */
function forceSplit(text: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    result.push(text.slice(i, i + size));
  }
  return result;
}

/**
 * Chunk by sentences (semantic chunking)
 */
export function chunkBySentences(
  text: string,
  options: { sentencesPerChunk?: number; overlap?: number } = {}
): Chunk[] {
  const { sentencesPerChunk = 5, overlap = 1 } = options;

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: Chunk[] = [];

  for (let i = 0; i < sentences.length; i += sentencesPerChunk - overlap) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    const content = chunkSentences.join(' ').trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunks.length,
        metadata: {
          startChar: 0, // Would need to calculate
          endChar: content.length,
          wordCount: content.split(/\s+/).length,
          charCount: content.length,
        },
      });
    }
  }

  return chunks;
}

/**
 * Chunk markdown by headers
 */
export function chunkMarkdown(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = text.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    // Extract header for context
    const headerMatch = section.match(/^(#{1,3})\s+(.+)/);
    const header = headerMatch ? headerMatch[2] : undefined;

    chunks.push({
      content: section.trim(),
      index: chunks.length,
      metadata: {
        startChar: 0,
        endChar: section.length,
        wordCount: section.split(/\s+/).length,
        charCount: section.length,
        ...(header && { section: header }),
      },
    });
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation)
 * OpenAI: ~4 chars per token for English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Smart chunking based on content type
 */
export function smartChunk(
  text: string,
  contentType: 'plain' | 'markdown' | 'code' = 'plain',
  options: ChunkOptions = {}
): Chunk[] {
  switch (contentType) {
    case 'markdown':
      return chunkMarkdown(text);
    case 'code':
      // For code, use function/class boundaries if possible
      return chunkText(text, {
        ...options,
        separators: ['\n\n', '\nfunction ', '\nclass ', '\nexport ', '\n'],
      });
    default:
      return chunkText(text, options);
  }
}
```

---

### Step 2: Create Ingestion Service

**2.1 Create `apps/api/src/services/ingestion.ts`:**

```typescript
import { db } from '../db/index.js';
import {
  documents,
  documentChunks,
  eq,
  type NewDocument,
  type NewDocumentChunk,
} from '@insight-os/db-schema';
import { generateEmbeddings } from '../lib/embeddings.js';
import { smartChunk, estimateTokens, type ChunkOptions } from '../lib/chunking.js';
import pdf from 'pdf-parse';

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
  batchSize: 20,
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
          tokenEstimate: estimateTokens(content),
        },
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
        metadata: chunk.metadata,
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
      status: 'completed',
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
      error: error instanceof Error ? error.message : 'Unknown error',
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
    const pdfData = await pdf(buffer);
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
          charCount: content.length,
        },
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
          ...chunk.metadata,
          // Could add page number tracking if using more sophisticated PDF parsing
        },
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
      status: 'completed',
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
      error: error instanceof Error ? error.message : 'Unknown error',
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
          fetchedAt: new Date().toISOString(),
        },
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
        metadata: chunk.metadata,
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
      status: 'completed',
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
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get document with chunk count
 */
export async function getDocumentWithStats(documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!document) return null;

  const [chunkStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalChars: sql<number>`sum(length(content))`,
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));

  return {
    ...document,
    chunkCount: Number(chunkStats?.count || 0),
    totalChars: Number(chunkStats?.totalChars || 0),
  };
}

import { sql } from '@insight-os/db-schema';
```

---

### Step 3: Create Documents API

**3.1 Create `apps/api/src/routes/documents.ts`:**

```typescript
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

    return c.json(createResponse({
      documents: docsWithStats,
      pagination: { limit, offset },
    }));
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

    return c.json(createResponse({
      chunks,
      pagination: { limit, offset },
    }));
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
        contentType?: 'plain' | 'markdown' | 'code';
      };
    }>();

    if (!content || !name) {
      return c.json(createErrorResponse('Content and name are required'), 400);
    }

    const result = await ingestText(content, name, {
      chunkOptions: {
        chunkSize: options?.chunkSize,
        chunkOverlap: options?.chunkOverlap,
      },
      contentType: options?.contentType,
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
    await db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, id));

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
```

**3.2 Update `apps/api/src/index.ts`:**

Add the documents route:

```typescript
import { documentsRoutes } from './routes/documents.js';

// ... existing code ...

app.route('/documents', documentsRoutes);
```

---

## Demo Checklist

- [ ] Ingest text content with chunking
- [ ] Ingest markdown with header-based chunking
- [ ] Ingest PDF files
- [ ] Ingest content from URLs
- [ ] List documents with chunk counts
- [ ] View document chunks
- [ ] Delete documents (cascades to chunks)
- [ ] Custom chunk size/overlap options work

---

## API Testing

```bash
# Ingest text
curl -X POST http://localhost:3001/documents/text \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tesla Overview",
    "content": "Tesla, Inc. is an American electric vehicle and clean energy company...(long text)...",
    "options": {"chunkSize": 500, "contentType": "plain"}
  }'

# Ingest from URL
curl -X POST http://localhost:3001/documents/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://raw.githubusercontent.com/example/repo/main/README.md"}'

# Upload PDF
curl -X POST http://localhost:3001/documents/upload \
  -F "file=@/path/to/document.pdf"

# List documents
curl http://localhost:3001/documents

# Get document chunks
curl http://localhost:3001/documents/{id}/chunks

# Delete document
curl -X DELETE http://localhost:3001/documents/{id}
```

---

## What's Next

**Phase 6: RAG Retrieval** will add:
- Hybrid search (BM25 + Vector)
- Semantic caching with Redis
- Query-to-context pipeline
- RAG response generation

