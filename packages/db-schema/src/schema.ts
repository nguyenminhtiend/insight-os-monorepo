import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  index,
  pgEnum
} from 'drizzle-orm/pg-core';

// Enums
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
  'deleted'
]);

// Conversations table
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    status: conversationStatusEnum('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('conversations_status_idx').on(table.status),
    index('conversations_created_at_idx').on(table.createdAt)
  ]
);

// Messages table
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<{
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      latencyMs?: number;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('messages_conversation_idx').on(table.conversationId),
    index('messages_created_at_idx').on(table.createdAt)
  ]
);

// Analysis results table
export const analysisResults = pgTable(
  'analysis_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null'
    }),
    type: text('type').notNull(), // 'company', 'market', 'trend'
    subject: text('subject').notNull(), // What was analyzed
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    promptId: text('prompt_id'), // Which prompt template was used
    model: text('model').notNull(),
    usage: jsonb('usage').$type<{
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('analysis_type_idx').on(table.type),
    index('analysis_subject_idx').on(table.subject),
    index('analysis_created_at_idx').on(table.createdAt)
  ]
);

// Cache table (for semantic caching in Phase 6)
export const cache = pgTable(
  'cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').unique().notNull(),
    value: jsonb('value').notNull(),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [index('cache_key_idx').on(table.key), index('cache_expires_idx').on(table.expiresAt)]
);

// Export table types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;

