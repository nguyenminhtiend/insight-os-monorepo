import { redis, cacheHelpers } from './redis.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';

const CACHE_PREFIX = 'semantic:';
const CACHE_TTL = 3600; // 1 hour
const SIMILARITY_THRESHOLD = 0.95;

interface CachedResponse {
  query: string;
  queryEmbedding: number[];
  response: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Get semantically similar cached response
 */
export async function getSemanticCache(
  query: string
): Promise<{ hit: boolean; response?: string; similarity?: number }> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Get all cache keys
    const keys = await redis.keys(`${CACHE_PREFIX}*`);

    if (keys.length === 0) {
      return { hit: false };
    }

    // Check each cached item for similarity
    let bestMatch: { response: string; similarity: number } | null = null;

    for (const key of keys) {
      const cached = await cacheHelpers.get<CachedResponse>(key);
      if (!cached) continue;

      const similarity = cosineSimilarity(queryEmbedding, cached.queryEmbedding);

      if (similarity >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = {
            response: cached.response,
            similarity
          };
        }
      }
    }

    if (bestMatch) {
      return {
        hit: true,
        response: bestMatch.response,
        similarity: bestMatch.similarity
      };
    }

    return { hit: false };
  } catch (error) {
    console.error('Semantic cache error:', error);
    return { hit: false };
  }
}

/**
 * Store response in semantic cache
 */
export async function setSemanticCache(
  query: string,
  response: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const cacheKey = `${CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const cached: CachedResponse = {
      query,
      queryEmbedding,
      response,
      metadata,
      timestamp: Date.now()
    };

    await cacheHelpers.set(cacheKey, cached, CACHE_TTL);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Clear semantic cache
 */
export async function clearSemanticCache(): Promise<number> {
  return cacheHelpers.deletePattern(`${CACHE_PREFIX}*`);
}

/**
 * Get cache stats
 */
export async function getCacheStats(): Promise<{
  entries: number;
  oldestTimestamp?: number;
  newestTimestamp?: number;
}> {
  const keys = await redis.keys(`${CACHE_PREFIX}*`);

  if (keys.length === 0) {
    return { entries: 0 };
  }

  let oldest = Infinity;
  let newest = 0;

  for (const key of keys) {
    const cached = await cacheHelpers.get<CachedResponse>(key);
    if (cached) {
      oldest = Math.min(oldest, cached.timestamp);
      newest = Math.max(newest, cached.timestamp);
    }
  }

  return {
    entries: keys.length,
    oldestTimestamp: oldest === Infinity ? undefined : oldest,
    newestTimestamp: newest === 0 ? undefined : newest
  };
}
