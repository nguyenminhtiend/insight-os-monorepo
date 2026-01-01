import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { openai, MODELS } from './ai.js';

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Reformulate query based on conversation history
 * Handles pronouns and implicit references
 */
export async function reformulateQuery(
  query: string,
  context?: ConversationContext
): Promise<string> {
  // If no context, return original query
  if (!context || context.messages.length === 0) {
    return query;
  }

  // Build conversation history
  const history = context.messages
    .slice(-6) // Last 3 exchanges
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Given this conversation history and a new query, rewrite the query to be self-contained.
Replace pronouns and references with their actual subjects.
If the query is already self-contained, return it unchanged.
Only return the reformulated query, nothing else.

Conversation:
${history}

New query: "${query}"

Reformulated query:`,
    temperature: 0,
    maxTokens: 200
  } as any);

  return result.text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Expand query with related terms
 */
export async function expandQuery(query: string): Promise<string[]> {
  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Generate 3 search query variations for better information retrieval.
Include synonyms and related concepts.
Return only the queries, one per line.

Original: "${query}"

Variations:`,
    temperature: 0.7,
    maxTokens: 150
  } as any);

  const variations = result.text
    .split('\n')
    .map((v) => v.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((v) => v.length > 0);

  return [query, ...variations];
}

/**
 * Decompose complex query into sub-queries
 */
export async function decomposeQuery(query: string): Promise<string[]> {
  const schema = z.object({
    isComplex: z.boolean(),
    subQueries: z.array(z.string())
  });

  const { object } = await generateObject({
    model: openai(MODELS.fast),
    schema,
    prompt: `Analyze if this query requires multiple pieces of information.
If so, decompose it into simpler sub-queries.
If the query is simple, return it as-is.

Query: "${query}"`,
    temperature: 0
  });

  if (!object.isComplex || object.subQueries.length === 0) {
    return [query];
  }

  return object.subQueries;
}

/**
 * Detect query intent for routing
 */
export async function detectIntent(query: string): Promise<{
  intent: 'factual' | 'analytical' | 'comparative' | 'exploratory' | 'procedural';
  confidence: number;
  entities: string[];
}> {
  const schema = z.object({
    intent: z.enum(['factual', 'analytical', 'comparative', 'exploratory', 'procedural']),
    confidence: z.number().min(0).max(1),
    entities: z.array(z.string())
  });

  const { object } = await generateObject({
    model: openai(MODELS.fast),
    schema,
    prompt: `Classify the intent of this query and extract key entities.

Intents:
- factual: Looking for specific facts or data
- analytical: Requires analysis or interpretation
- comparative: Comparing multiple items
- exploratory: Open-ended exploration
- procedural: How-to or step-by-step

Query: "${query}"`,
    temperature: 0
  });

  return object;
}

/**
 * Hypothetical Document Embedding (HyDE)
 * Generate a hypothetical answer to use for retrieval
 */
export async function generateHypotheticalAnswer(query: string): Promise<string> {
  const result = await generateText({
    model: openai(MODELS.fast),
    prompt: `Write a short, factual paragraph that would answer this question.
This will be used for semantic search, so include relevant keywords.

Question: "${query}"

Answer:`,
    temperature: 0.3,
    maxTokens: 200
  } as any);

  return result.text.trim();
}
