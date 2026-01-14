export * from './buffer.js';
export * from './session.js';
export * from './longterm.js';
export * from './persistence.js';

import { SessionMemoryManager } from './session.js';
import { LongTermMemory } from './longterm.js';
import { PersistenceManager } from './persistence.js';

/**
 * Unified memory manager for multi-server deployments
 *
 * Architecture:
 * - PostgreSQL: Source of truth, all messages (permanent)
 * - Redis: Optional cache for session facts and recent messages (1hr TTL)
 * - BufferMemory: REMOVED - doesn't work in stateless HTTP/multi-server
 *
 * This design ensures:
 * - Messages persist across server instances (load balancing works)
 * - Context is available even if Redis expires
 * - No in-memory state that breaks horizontal scaling
 */
export class MemoryManager {
  public session: SessionMemoryManager;
  public longterm: LongTermMemory;
  public persistence: PersistenceManager;
  private userId: string;
  private conversationId: string;

  constructor(userId: string, conversationId: string) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.session = new SessionMemoryManager(userId, conversationId);
    this.longterm = new LongTermMemory(userId);
    this.persistence = new PersistenceManager(userId, conversationId);
  }

  /**
   * Get combined context for LLM
   * PostgreSQL is primary source, Redis provides optional caching
   */
  async getContext(): Promise<string> {
    const [sessionMem, longTermMem, dbMessages] = await Promise.all([
      this.session.load(),
      this.longterm.getByType('preference', 5),
      this.persistence.loadRecentMessages(20)
    ]);

    const parts: string[] = [];

    // Recent conversation from PostgreSQL (last 20 messages)
    // This works across all server instances and survives Redis expiry
    if (dbMessages.length > 0) {
      const dbContext = dbMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
      parts.push(`Recent conversation:\n${dbContext}`);
    }

    // Session facts from Redis (ephemeral, 1hr TTL)
    if (sessionMem?.facts && sessionMem.facts.length > 0) {
      parts.push(
        `Session facts:\n${sessionMem.facts.map((f) => `- ${f.key}: ${f.value}`).join('\n')}`
      );
    }

    // Long-term preferences from PostgreSQL
    if (longTermMem.length > 0) {
      parts.push(
        `User preferences:\n${longTermMem.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      );
    }

    return parts.join('\n\n');
  }

  /**
   * Add message and persist across tiers
   * - Redis: Cache with TTL (fast access, auto-expires)
   * - PostgreSQL: Permanent storage (source of truth)
   */
  async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await Promise.all([
      this.session.addMessage(role, content),
      this.persistence.saveMessage(role, content)
    ]);
  }

  /**
   * Get conversation ID (useful for linking tickets)
   */
  async getConversationId(): Promise<string> {
    return await this.persistence.getOrCreateConversation();
  }

  /**
   * Get all conversations for this user
   */
  static async getUserConversations(userId: string, limit?: number) {
    return await PersistenceManager.getUserConversations(userId, limit);
  }
}

