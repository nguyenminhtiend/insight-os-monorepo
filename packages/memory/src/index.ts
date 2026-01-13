export * from './buffer.js';
export * from './session.js';
export * from './longterm.js';
export * from './persistence.js';

import { BufferMemory } from './buffer.js';
import { SessionMemoryManager } from './session.js';
import { LongTermMemory } from './longterm.js';
import { PersistenceManager } from './persistence.js';

/**
 * Unified memory manager combining all tiers
 */
export class MemoryManager {
  public buffer: BufferMemory;
  public session: SessionMemoryManager;
  public longterm: LongTermMemory;
  public persistence: PersistenceManager;
  private userId: string;
  private conversationId: string;

  constructor(userId: string, conversationId: string) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.buffer = new BufferMemory(10);
    this.session = new SessionMemoryManager(userId, conversationId);
    this.longterm = new LongTermMemory(userId);
    this.persistence = new PersistenceManager(userId, conversationId);
  }

  /**
   * Get combined context for LLM
   * Includes DB-persisted messages for long-term history
   */
  async getContext(): Promise<string> {
    const [sessionMem, longTermMem, dbMessages] = await Promise.all([
      this.session.load(),
      this.longterm.getByType('preference', 5),
      this.persistence.loadRecentMessages(20)
    ]);

    const parts: string[] = [];

    // Buffer context (most recent, in-memory)
    const bufferContext = this.buffer.toContext();
    if (bufferContext) {
      parts.push(`Recent conversation:\n${bufferContext}`);
    }

    // DB history (older messages beyond Redis TTL)
    if (dbMessages.length > 0) {
      const dbContext = dbMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
      parts.push(`Previous conversation history:\n${dbContext}`);
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
   * Persists to: buffer (memory) -> session (Redis) -> DB (PostgreSQL)
   */
  async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    this.buffer.addMessage(role, content);
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
