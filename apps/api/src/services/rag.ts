import { streamText, generateText } from 'ai';
import { openai, MODELS } from '../lib/ai.js';
import { retrieve, type RetrievalOptions, type RetrievalResult } from '../lib/retrieval.js';
import { getSemanticCache, setSemanticCache } from '../lib/cache.js';
import { rerank, type RerankResult } from '../lib/reranker.js';
import {
  reformulateQuery,
  generateHypotheticalAnswer,
  type ConversationContext
} from '../lib/query.js';

export interface RAGOptions extends RetrievalOptions {
  model?: string;
  systemPrompt?: string;
  useCache?: boolean;
  includeContext?: boolean; // Include retrieved chunks in response
}

export interface RAGResponse {
  answer: string;
  context: RetrievalResult[];
  cached: boolean;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are InsightOS, a strategic market intelligence assistant.
Answer questions based on the provided context. If the context doesn't contain relevant information,
say so clearly. Be concise and data-driven.

Guidelines:
- Use information from the context to support your answers
- Cite specific details when available
- If uncertain, indicate your confidence level
- Don't make up information not in the context`;

/**
 * RAG query - retrieve and generate
 */
export async function ragQuery(query: string, options: RAGOptions = {}): Promise<RAGResponse> {
  const {
    model = MODELS.smart,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    useCache = true,
    includeContext = true,
    ...retrievalOptions
  } = options;

  // Check semantic cache first
  if (useCache) {
    const cached = await getSemanticCache(query);
    if (cached.hit && cached.response) {
      return {
        answer: cached.response,
        context: [],
        cached: true,
        model: 'cache'
      };
    }
  }

  // Retrieve relevant context
  const context = await retrieve(query, retrievalOptions);

  // Build context string
  const contextStr = context.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

  // Generate response
  const prompt = contextStr ? `Context:\n${contextStr}\n\nQuestion: ${query}` : query;

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000
  } as any);

  // Cache the response
  if (useCache) {
    await setSemanticCache(query, result.text, {
      contextCount: context.length,
      model
    });
  }

  return {
    answer: result.text,
    context: includeContext ? context : [],
    cached: false,
    model,
    usage: {
      promptTokens: (result.usage as any).inputTokens ?? 0,
      completionTokens: (result.usage as any).outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0
    }
  };
}

/**
 * Streaming RAG query
 */
export async function ragQueryStream(
  query: string,
  options: RAGOptions = {}
): Promise<{
  stream: AsyncIterable<string>;
  context: RetrievalResult[];
  model: string;
}> {
  const {
    model = MODELS.smart,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    ...retrievalOptions
  } = options;

  // Retrieve context
  const context = await retrieve(query, retrievalOptions);

  // Build context string
  const contextStr = context.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

  const prompt = contextStr ? `Context:\n${contextStr}\n\nQuestion: ${query}` : query;

  // Stream response
  const result = streamText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000
  } as any);

  return {
    stream: result.textStream,
    context,
    model
  };
}

/**
 * Multi-query RAG - generate multiple query variations for better retrieval
 */
export async function multiQueryRAG(query: string, options: RAGOptions = {}): Promise<RAGResponse> {
  const { model = MODELS.smart, ...retrievalOptions } = options;

  // Generate query variations
  const variationsResult = await generateText({
    model: openai(MODELS.fast),
    prompt: `Generate 3 different variations of this search query to improve retrieval.
Return only the variations, one per line.

Original query: "${query}"`,
    temperature: 0.7,
    maxTokens: 200
  } as any);

  const variations = [query, ...variationsResult.text.split('\n').filter((v) => v.trim())];

  // Retrieve for each variation
  const allResults: RetrievalResult[] = [];
  const seen = new Set<string>();

  for (const variation of variations.slice(0, 4)) {
    const results = await retrieve(variation, { ...retrievalOptions, limit: 5 });
    for (const result of results) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        allResults.push(result);
      }
    }
  }

  // Sort by score and take top results
  allResults.sort((a, b) => b.score - a.score);
  const topContext = allResults.slice(0, retrievalOptions.limit || 10);

  // Generate final response
  const contextStr = topContext.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

  const result = await generateText({
    model: openai(model),
    system: DEFAULT_SYSTEM_PROMPT,
    prompt: `Context:\n${contextStr}\n\nQuestion: ${query}`,
    temperature: 0.3,
    maxTokens: 2000
  } as any);

  return {
    answer: result.text,
    context: topContext,
    cached: false,
    model,
    usage: {
      promptTokens: (result.usage as any).inputTokens ?? 0,
      completionTokens: (result.usage as any).outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0
    }
  };
}

// ==================== ADVANCED RAG (Phase 7) ====================

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
          rerankCount: 0
        }
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
    limit: useReranking ? limit : options.limit || 10
  });

  // Step 4: Reranking
  let finalContext: RerankResult[];

  if (useReranking && retrievedResults.length > 0) {
    finalContext = await rerank(searchQuery, retrievedResults, {
      topK: options.limit || 5,
      threshold: 0.3
    });
  } else {
    finalContext = retrievedResults.map((r) => ({
      ...r,
      rerankScore: r.score,
      originalScore: r.score
    }));
  }

  // Step 5: Generate Response
  const contextStr = finalContext
    .map((c, i) => `[${i + 1}] (relevance: ${(c.rerankScore * 100).toFixed(0)}%) ${c.content}`)
    .join('\n\n');

  const prompt = contextStr ? `Context:\n${contextStr}\n\nQuestion: ${searchQuery}` : searchQuery;

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 2000
  } as any);

  // Cache the response
  if (useCache) {
    await setSemanticCache(searchQuery, result.text, {
      contextCount: finalContext.length,
      model,
      reranked: useReranking
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
      promptTokens: (result.usage as any).inputTokens ?? 0,
      completionTokens: (result.usage as any).outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0
    },
    metadata: {
      rerankingUsed: useReranking,
      queryReformulated: wasReformulated,
      hydeUsed,
      retrievalCount: retrievedResults.length,
      rerankCount: finalContext.length
    }
  };
}
