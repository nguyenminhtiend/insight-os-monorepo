import { db, conversations, messages, eq, and, desc, sql } from '@insight-os/db-schema';

/**
 * Database persistence layer for messages and conversations
 * Ensures user isolation - users can only access their own data
 */
export class PersistenceManager {
  private userId: string;
  private conversationId: string;
  private dbConversationId?: string;

  constructor(userId: string, conversationId: string) {
    this.userId = userId;
    this.conversationId = conversationId;
  }

  /**
   * Get or create conversation in DB
   * Ensures user isolation by linking conversation to userId
   */
  async getOrCreateConversation(): Promise<string> {
    if (this.dbConversationId) {
      return this.dbConversationId;
    }

    // Check if conversation exists with this external ID
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, this.userId),
          sql`${conversations.metadata}->>'externalId' = ${this.conversationId}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      this.dbConversationId = existing[0].id;
      return existing[0].id;
    }

    // Create new conversation linked to this user
    const [newConv] = await db
      .insert(conversations)
      .values({
        userId: this.userId,
        title: `Support Session ${this.conversationId}`,
        status: 'active',
        metadata: {
          externalId: this.conversationId,
          type: 'support'
        }
      })
      .returning();

    this.dbConversationId = newConv.id;
    return newConv.id;
  }

  /**
   * Save message to DB
   * Only saves to conversations owned by this user
   */
  async saveMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    const convId = await this.getOrCreateConversation();

    await db.insert(messages).values({
      conversationId: convId,
      role,
      content
    });

    // Update conversation timestamp
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, convId));
  }

  /**
   * Load recent messages from DB for this conversation
   * Only returns messages from user's own conversations
   */
  async loadRecentMessages(limit: number = 50): Promise<
    Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      createdAt: Date;
    }>
  > {
    const convId = await this.getOrCreateConversation();

    const msgs = await db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt
      })
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return msgs.reverse(); // Return in chronological order
  }

  /**
   * Get all conversations for this user
   * Ensures user can only see their own conversations
   */
  static async getUserConversations(
    userId: string,
    limit: number = 20
  ): Promise<
    Array<{
      id: string;
      title: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      messageCount?: number;
    }>
  > {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);

    return convs.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
  }
}
