import { db } from '../db/index.js';
import { sql } from '@insight-os/db-schema';
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
  vectorWeight?: number; // 0-1, weight for vector results in hybrid
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  limit: 10,
  threshold: 0.5,
  documentIds: [],
  useVector: true,
  useKeyword: true,
  vectorWeight: 0.7
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

  const documentFilter =
    opts.documentIds && opts.documentIds.length > 0
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

  return (results as any[]).map((row: any) => ({
    id: row.id,
    content: row.content,
    documentId: row.documentId,
    score: parseFloat(row.score),
    metadata: row.metadata,
    source: 'vector' as const
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

  if (!tsQuery) {
    return [];
  }

  const documentFilter =
    opts.documentIds && opts.documentIds.length > 0
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
  const rows = results as any[];
  const maxScore = rows.length > 0 ? Math.max(...rows.map((r: any) => r.score)) : 1;

  return rows.map((row: any) => ({
    id: row.id,
    content: row.content,
    documentId: row.documentId,
    score: row.score / maxScore,
    metadata: row.metadata,
    source: 'keyword' as const
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
    opts.useKeyword ? keywordSearch(query, { ...opts, limit: opts.limit * 2 }) : []
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
      source: 'hybrid' as const
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
