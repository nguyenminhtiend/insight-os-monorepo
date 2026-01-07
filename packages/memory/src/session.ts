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
