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

