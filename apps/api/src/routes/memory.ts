import { Hono } from 'hono';
import { MemoryManager, LongTermMemory } from '@insight-os/memory';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const memoryRoutes = new Hono();

/**
 * GET /memory/:userId
 * Get user memories
 */
memoryRoutes.get('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const type = c.req.query('type');

    const memory = new LongTermMemory(userId);
    const memories = type ? await memory.getByType(type) : await memory.search('', 50);

    return c.json(createResponse({ memories }));
  } catch (error) {
    console.error('Error getting memories:', error);
    return c.json(createErrorResponse('Failed to get memories'), 500);
  }
});

/**
 * POST /memory/:userId
 * Store a memory
 */
memoryRoutes.post('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const { type, key, value, importance } = await c.req.json<{
      type: string;
      key: string;
      value: string;
      importance?: number;
    }>();

    const memory = new LongTermMemory(userId);
    const result = await memory.store(type, key, value, importance);

    return c.json(createResponse(result), 201);
  } catch (error) {
    console.error('Error storing memory:', error);
    return c.json(createErrorResponse('Failed to store memory'), 500);
  }
});

/**
 * POST /memory/:userId/search
 * Search memories
 */
memoryRoutes.post('/:userId/search', async (c) => {
  try {
    const userId = c.req.param('userId');
    const { query } = await c.req.json<{ query: string }>();

    const memory = new LongTermMemory(userId);
    const results = await memory.search(query);

    return c.json(createResponse({ results }));
  } catch (error) {
    console.error('Error searching memories:', error);
    return c.json(createErrorResponse('Search failed'), 500);
  }
});

/**
 * POST /memory/:userId/extract
 * Extract memories from conversation
 */
memoryRoutes.post('/:userId/extract', async (c) => {
  try {
    const userId = c.req.param('userId');
    const { messages } = await c.req.json<{
      messages: Array<{ role: string; content: string }>;
    }>();

    const memory = new LongTermMemory(userId);
    const extracted = await memory.extractFromConversation(messages);

    return c.json(createResponse({ memories: extracted }));
  } catch (error) {
    console.error('Error extracting memories:', error);
    return c.json(createErrorResponse('Extraction failed'), 500);
  }
});

/**
 * POST /memory/:userId/relevant
 * Get relevant memories for a query
 */
memoryRoutes.post('/:userId/relevant', async (c) => {
  try {
    const userId = c.req.param('userId');
    const { query, limit } = await c.req.json<{ query: string; limit?: number }>();

    const memory = new LongTermMemory(userId);
    const results = await memory.getRelevant(query, limit);

    return c.json(createResponse({ memories: results }));
  } catch (error) {
    console.error('Error getting relevant memories:', error);
    return c.json(createErrorResponse('Retrieval failed'), 500);
  }
});

/**
 * DELETE /memory/:userId/:memoryId
 * Delete a memory
 */
memoryRoutes.delete('/:userId/:memoryId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const memoryId = c.req.param('memoryId');

    const memory = new LongTermMemory(userId);
    const deleted = await memory.forget(memoryId);

    return c.json(createResponse({ deleted }));
  } catch (error) {
    console.error('Error deleting memory:', error);
    return c.json(createErrorResponse('Delete failed'), 500);
  }
});

