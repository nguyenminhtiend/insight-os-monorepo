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
    returnDocuments: false
  });

  return response.results.map((r) => ({
    ...results[r.index],
    rerankScore: r.relevanceScore,
    originalScore: results[r.index].score
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
      maxTokens: 5
    } as any);

    const score = parseFloat(response.text.trim()) || 0;
    return {
      ...result,
      rerankScore: score / 10,
      originalScore: result.score
    };
  });

  const scored = await Promise.all(scoringPromises);

  // Sort by rerank score and take top K
  return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
}

/**
 * Rerank retrieval results
 */
export async function rerank(
  query: string,
  results: RetrievalResult[],
  options: RerankOptions = {}
): Promise<RerankResult[]> {
  const { topK = 5, model = cohere ? 'cohere' : 'llm', threshold = 0 } = options;

  if (results.length === 0) {
    return [];
  }

  // If few results, skip reranking
  if (results.length <= topK) {
    return results.map((r) => ({
      ...r,
      rerankScore: r.score,
      originalScore: r.score
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
      reranked: await rerank(query, results, options)
    }))
  );

  return new Map(results.map((r) => [r.query, r.reranked]));
}
