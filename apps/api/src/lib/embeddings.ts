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
    value: text
  });
  return embedding;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts
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
): Promise<
  Array<{
    id: string;
    content: string;
    documentId: string;
    similarity: number;
    metadata: Record<string, unknown> | null;
  }>
> {
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
  return (results as any[])
    .filter((row) => row.similarity >= threshold)
    .map((row) => ({
      id: row.id,
      content: row.content,
      documentId: row.documentId,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata
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
): Promise<
  Array<{
    id: string;
    content: string;
    documentId: string;
    similarity: number;
    metadata: Record<string, unknown> | null;
  }>
> {
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
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(documentChunks);

  const [withEmbeddings] = await db
    .select({ count: sql<number>`count(*)` })
    .from(documentChunks)
    .where(sql`embedding IS NOT NULL`);

  return {
    totalChunks: Number(total.count),
    chunksWithEmbeddings: Number(withEmbeddings.count),
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS
  };
}
