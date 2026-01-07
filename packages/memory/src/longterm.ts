import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@insight-os/db-schema/schema';
import { userMemories, eq, and, desc, sql, type UserMemory } from '@insight-os/db-schema';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://admin:123456@127.0.0.1:5432/insight_os';
const client = postgres(connectionString);
const db = drizzle(client, { schema });

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Memory {
  id: string;
  type: string;
  key: string;
  value: string;
  importance: number;
  metadata?: Record<string, unknown>;
}

/**
 * Long-term persistent memory (PostgreSQL)
 */
export class LongTermMemory {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Store a memory
   */
  async store(
    type: string,
    key: string,
    value: string,
    importance: number = 5,
    metadata?: Record<string, unknown>
  ): Promise<Memory> {
    // Check if memory exists
    const existing = await db
      .select()
      .from(userMemories)
      .where(and(eq(userMemories.userId, this.userId), eq(userMemories.key, key)))
      .limit(1);

    let memory: UserMemory;

    if (existing.length > 0) {
      // Update existing
      [memory] = await db
        .update(userMemories)
        .set({
          type,
          value,
          importance,
          metadata,
          updatedAt: new Date()
        })
        .where(eq(userMemories.id, existing[0].id))
        .returning();
    } else {
      // Insert new
      [memory] = await db
        .insert(userMemories)
        .values({
          userId: this.userId,
          type,
          key,
          value,
          importance,
          metadata
        })
        .returning();
    }

    return {
      id: memory.id,
      type: memory.type,
      key: memory.key,
      value: memory.value,
      importance: memory.importance || 5,
      metadata: memory.metadata || undefined
    };
  }

  /**
   * Retrieve memories by type
   */
  async getByType(type: string, limit: number = 10): Promise<Memory[]> {
    const results = await db
      .select()
      .from(userMemories)
      .where(and(eq(userMemories.userId, this.userId), eq(userMemories.type, type)))
      .orderBy(desc(userMemories.importance), desc(userMemories.lastAccessedAt))
      .limit(limit);

    // Update access count
    for (const memory of results) {
      await db
        .update(userMemories)
        .set({
          accessCount: (memory.accessCount || 0) + 1,
          lastAccessedAt: new Date()
        })
        .where(eq(userMemories.id, memory.id));
    }

    return results.map((m: UserMemory) => ({
      id: m.id,
      type: m.type,
      key: m.key,
      value: m.value,
      importance: m.importance || 5,
      metadata: m.metadata || undefined
    }));
  }

  /**
   * Search memories by key/value
   */
  async search(query: string, limit: number = 10): Promise<Memory[]> {
    const results = await db
      .select()
      .from(userMemories)
      .where(
        and(
          eq(userMemories.userId, this.userId),
          sql`(key ILIKE ${`%${query}%`} OR value ILIKE ${`%${query}%`})`
        )
      )
      .orderBy(desc(userMemories.importance))
      .limit(limit);

    return results.map((m: UserMemory) => ({
      id: m.id,
      type: m.type,
      key: m.key,
      value: m.value,
      importance: m.importance || 5,
      metadata: m.metadata || undefined
    }));
  }

  /**
   * Extract and store memories from conversation
   */
  async extractFromConversation(
    messages: Array<{ role: string; content: string }>
  ): Promise<Memory[]> {
    const memorySchema = z.object({
      memories: z.array(
        z.object({
          type: z.enum(['preference', 'fact', 'learning']),
          key: z.string(),
          value: z.string(),
          importance: z.number().min(1).max(10)
        })
      )
    });

    const conversation = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: memorySchema,
      prompt: `Extract memorable facts from this conversation.
Focus on: user preferences, important facts mentioned, learnings.
Only extract genuinely useful information.

Conversation:
${conversation}`,
      temperature: 0.2
    });

    const stored: Memory[] = [];
    for (const mem of object.memories) {
      const result = await this.store(mem.type, mem.key, mem.value, mem.importance);
      stored.push(result);
    }

    return stored;
  }

  /**
   * Get relevant memories for a query
   */
  async getRelevant(query: string, limit: number = 5): Promise<Memory[]> {
    // Get all memories for user
    const allMemories = await db
      .select()
      .from(userMemories)
      .where(eq(userMemories.userId, this.userId))
      .orderBy(desc(userMemories.importance))
      .limit(50);

    if (allMemories.length === 0) return [];

    // Use LLM to rank relevance
    const relevanceSchema = z.object({
      relevantIds: z.array(z.string())
    });

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: relevanceSchema,
      prompt: `Given this query, select the most relevant memories.
Return only the IDs of relevant memories, in order of relevance.

Query: "${query}"

Memories:
${allMemories.map((m: UserMemory) => `ID: ${m.id} | ${m.type}: ${m.key} = ${m.value}`).join('\n')}`,
      temperature: 0
    });

    const relevantMemories: Memory[] = [];
    for (const id of object.relevantIds.slice(0, limit)) {
      const mem = allMemories.find((m: UserMemory) => m.id === id);
      if (mem) {
        relevantMemories.push({
          id: mem.id,
          type: mem.type,
          key: mem.key,
          value: mem.value,
          importance: mem.importance || 5,
          metadata: mem.metadata || undefined
        });
      }
    }

    return relevantMemories;
  }

  /**
   * Forget (delete) a memory
   */
  async forget(memoryId: string): Promise<boolean> {
    const result = await db
      .delete(userMemories)
      .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, this.userId)))
      .returning();

    return result.length > 0;
  }
}
