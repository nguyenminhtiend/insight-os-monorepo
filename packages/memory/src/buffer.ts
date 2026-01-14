/**
 * @deprecated BufferMemory is NOT suitable for production use in stateless HTTP APIs
 *
 * PROBLEMS:
 * - In-memory storage that's per-process and doesn't persist across requests
 * - Each HTTP request creates a new MemoryManager instance with empty buffer
 * - Breaks in load-balanced/multi-server deployments (state not shared)
 * - Provides zero value in stateless architectures
 *
 * USE INSTEAD:
 * - PostgreSQL: Primary storage for all messages (works across all servers)
 * - Redis: Optional cache for hot data (shared across servers)
 *
 * This file kept for backward compatibility but should NOT be used.
 * MemoryManager no longer instantiates BufferMemory.
 */

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
