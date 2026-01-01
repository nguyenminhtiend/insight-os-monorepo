# Phase 11: Memory System - Multi-tier Memory

> **Goal:** Implement multi-tier memory system with conversation buffer, session memory (Redis), and long-term memory (Postgres) for persistent context.

---

## Prerequisites

- Phase 10 completed (HITL workflows)
- Redis and PostgreSQL configured

---

## Memory Architecture

```
┌─────────────────────────────────────────────────┐
│                 Memory System                    │
├─────────────────┬───────────────┬───────────────┤
│   Short-Term    │   Mid-Term    │   Long-Term   │
│   (Buffer)      │   (Session)   │  (Persistent) │
├─────────────────┼───────────────┼───────────────┤
│ • Last N msgs   │ • Session ctx │ • User prefs  │
│ • Current task  │ • Recent hist │ • Learnings   │
│ • Working mem   │ • Temp facts  │ • Knowledge   │
│ In-memory       │ Redis (TTL)   │ PostgreSQL    │
└─────────────────┴───────────────┴───────────────┘
```

---

## Implementation Steps

### Step 1: Update Database Schema for Memory

**1.1 Add to `packages/db-schema/src/schema.ts`:**

```typescript
// User memories table
export const userMemories = pgTable(
  'user_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(), // 'preference', 'fact', 'learning', 'context'
    key: text('key').notNull(),
    value: text('value').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    importance: integer('importance').default(5), // 1-10
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('memories_user_idx').on(table.userId),
    index('memories_type_idx').on(table.type),
    index('memories_key_idx').on(table.key)
  ]
);

// Conversation summaries for long-term memory
export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade'
    }),
    userId: text('user_id').notNull(),
    summary: text('summary').notNull(),
    keyTopics: jsonb('key_topics').$type<string[]>(),
    entities: jsonb('entities').$type<string[]>(),
    sentiment: text('sentiment'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('summaries_user_idx').on(table.userId),
    index('summaries_conversation_idx').on(table.conversationId)
  ]
);

export type UserMemory = typeof userMemories.$inferSelect;
export type NewUserMemory = typeof userMemories.$inferInsert;
```

### Step 2: Create Memory Package

**2.1 Create `packages/memory/package.json`:**

```json
{
  "name": "@insight-os/memory",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@insight-os/db-schema": "workspace:*",
    "ioredis": "^5.4.2",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0"
  }
}
```

**2.2 Create `packages/memory/src/buffer.ts`:**

```typescript
/**
 * Short-term buffer memory (in-memory, per-request)
 */
export class BufferMemory {
  private messages: Array<{ role: string; content: string }> = [];
  private maxMessages: number;
  private workingMemory: Map<string, unknown> = new Map();

  constructor(maxMessages: number = 10) {
    this.maxMessages = maxMessages;
  }

  addMessage(role: string, content: string): void {
    this.messages.push({ role, content });
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  getMessages(): Array<{ role: string; content: string }> {
    return [...this.messages];
  }

  getLastN(n: number): Array<{ role: string; content: string }> {
    return this.messages.slice(-n);
  }

  setWorkingMemory(key: string, value: unknown): void {
    this.workingMemory.set(key, value);
  }

  getWorkingMemory<T>(key: string): T | undefined {
    return this.workingMemory.get(key) as T;
  }

  clear(): void {
    this.messages = [];
    this.workingMemory.clear();
  }

  toContext(): string {
    return this.messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  }
}
```

**2.3 Create `packages/memory/src/session.ts`:**

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 3600; // 1 hour

export interface SessionMemory {
  userId: string;
  sessionId: string;
  context: Record<string, unknown>;
  recentMessages: Array<{ role: string; content: string; timestamp: number }>;
  facts: Array<{ key: string; value: string; source: string }>;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Mid-term session memory (Redis with TTL)
 */
export class SessionMemoryManager {
  private userId: string;
  private sessionId: string;

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
  }

  private getKey(): string {
    return `${SESSION_PREFIX}${this.userId}:${this.sessionId}`;
  }

  async load(): Promise<SessionMemory | null> {
    const data = await redis.get(this.getKey());
    if (!data) return null;

    // Refresh TTL on access
    await redis.expire(this.getKey(), SESSION_TTL);
    return JSON.parse(data);
  }

  async save(memory: Partial<SessionMemory>): Promise<void> {
    const existing = await this.load();
    const updated: SessionMemory = {
      userId: this.userId,
      sessionId: this.sessionId,
      context: {},
      recentMessages: [],
      facts: [],
      createdAt: Date.now(),
      ...existing,
      ...memory,
      lastActivityAt: Date.now()
    };

    await redis.setex(this.getKey(), SESSION_TTL, JSON.stringify(updated));
  }

  async addMessage(role: string, content: string): Promise<void> {
    const memory = await this.load();
    const messages = memory?.recentMessages || [];

    messages.push({ role, content, timestamp: Date.now() });

    // Keep last 50 messages in session
    if (messages.length > 50) {
      messages.shift();
    }

    await this.save({ recentMessages: messages });
  }

  async addFact(key: string, value: string, source: string): Promise<void> {
    const memory = await this.load();
    const facts = memory?.facts || [];

    // Update existing or add new
    const existingIndex = facts.findIndex((f) => f.key === key);
    if (existingIndex >= 0) {
      facts[existingIndex] = { key, value, source };
    } else {
      facts.push({ key, value, source });
    }

    await this.save({ facts });
  }

  async setContext(key: string, value: unknown): Promise<void> {
    const memory = await this.load();
    const context = memory?.context || {};
    context[key] = value;
    await this.save({ context });
  }

  async getContext<T>(key: string): Promise<T | undefined> {
    const memory = await this.load();
    return memory?.context?.[key] as T;
  }

  async clear(): Promise<void> {
    await redis.del(this.getKey());
  }
}
```

**2.4 Create `packages/memory/src/longterm.ts`:**

```typescript
import { db } from '@insight-os/db-schema';
import { userMemories, eq, and, desc, sql } from '@insight-os/db-schema';
import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

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
    const [memory] = await db
      .insert(userMemories)
      .values({
        userId: this.userId,
        type,
        key,
        value,
        importance,
        metadata
      })
      .onConflictDoUpdate({
        target: [userMemories.userId, userMemories.key],
        set: {
          value,
          importance,
          metadata,
          updatedAt: new Date()
        }
      })
      .returning();

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

    return results.map((m) => ({
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

    return results.map((m) => ({
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
    const schema = z.object({
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
      schema,
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
    const schema = z.object({
      relevantIds: z.array(z.string())
    });

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema,
      prompt: `Given this query, select the most relevant memories.
Return only the IDs of relevant memories, in order of relevance.

Query: "${query}"

Memories:
${allMemories.map((m) => `ID: ${m.id} | ${m.type}: ${m.key} = ${m.value}`).join('\n')}`,
      temperature: 0
    });

    return object.relevantIds
      .slice(0, limit)
      .map((id) => {
        const mem = allMemories.find((m) => m.id === id);
        return mem
          ? {
              id: mem.id,
              type: mem.type,
              key: mem.key,
              value: mem.value,
              importance: mem.importance || 5,
              metadata: mem.metadata || undefined
            }
          : null;
      })
      .filter((m): m is Memory => m !== null);
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
```

**2.5 Create `packages/memory/src/index.ts`:**

```typescript
export * from './buffer.js';
export * from './session.js';
export * from './longterm.js';

import { BufferMemory } from './buffer.js';
import { SessionMemoryManager } from './session.js';
import { LongTermMemory } from './longterm.js';

/**
 * Unified memory manager combining all tiers
 */
export class MemoryManager {
  public buffer: BufferMemory;
  public session: SessionMemoryManager;
  public longterm: LongTermMemory;

  constructor(userId: string, sessionId: string) {
    this.buffer = new BufferMemory(10);
    this.session = new SessionMemoryManager(userId, sessionId);
    this.longterm = new LongTermMemory(userId);
  }

  /**
   * Get combined context for LLM
   */
  async getContext(): Promise<string> {
    const [sessionMem, longTermMem] = await Promise.all([
      this.session.load(),
      this.longterm.getByType('preference', 5)
    ]);

    const parts: string[] = [];

    // Buffer context
    const bufferContext = this.buffer.toContext();
    if (bufferContext) {
      parts.push(`Recent conversation:\n${bufferContext}`);
    }

    // Session facts
    if (sessionMem?.facts && sessionMem.facts.length > 0) {
      parts.push(
        `Session facts:\n${sessionMem.facts.map((f) => `- ${f.key}: ${f.value}`).join('\n')}`
      );
    }

    // Long-term preferences
    if (longTermMem.length > 0) {
      parts.push(
        `User preferences:\n${longTermMem.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      );
    }

    return parts.join('\n\n');
  }

  /**
   * Add message and update all memory tiers
   */
  async addMessage(role: string, content: string): Promise<void> {
    this.buffer.addMessage(role, content);
    await this.session.addMessage(role, content);
  }
}
```

### Step 3: Add Memory API Routes

**3.1 Create `apps/api/src/routes/memory.ts`:**

```typescript
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
    return c.json(createErrorResponse('Search failed'), 500);
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
    return c.json(createErrorResponse('Delete failed'), 500);
  }
});
```

---

## Demo Checklist

- [ ] Buffer memory stores recent messages
- [ ] Session memory persists to Redis
- [ ] Long-term memory stores to PostgreSQL
- [ ] Memory extraction from conversations
- [ ] Relevant memory retrieval
- [ ] Combined context generation

---

## What's Next

**Phase 12: Background Jobs** will add:

- BullMQ for async processing
- Document processing queue
- Scheduled memory maintenance
