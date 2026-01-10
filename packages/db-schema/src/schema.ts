import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  index,
  pgEnum,
  customType
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom vector type for pgvector
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)'; // OpenAI embedding dimension
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  }
});

// Enums
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
  'deleted'
]);
export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'processing',
  'completed',
  'failed'
]);
export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'pending',
  'resolved',
  'escalated'
]);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const articleStatusEnum = pgEnum('article_status', ['draft', 'published', 'archived']);

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

// Documents table (for RAG source documents)
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'pdf', 'txt', 'md', 'url'
    source: text('source'), // Original file path or URL
    content: text('content'), // Full text content
    status: documentStatusEnum('status').default('pending').notNull(),
    metadata: jsonb('metadata').$type<{
      size?: number;
      pageCount?: number;
      wordCount?: number;
      language?: string;
      [key: string]: unknown;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('documents_status_idx').on(table.status),
    index('documents_type_idx').on(table.type)
  ]
);

// Document chunks table (for chunked content with embeddings)
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vectorType('embedding'), // 1536-dim OpenAI embeddings
    metadata: jsonb('metadata').$type<{
      startChar?: number;
      endChar?: number;
      pageNumber?: number;
      section?: string;
      [key: string]: unknown;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('chunks_document_idx').on(table.documentId),
    index('chunks_index_idx').on(table.chunkIndex)
    // Vector similarity index will be created via raw SQL migration
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

// User memories table (Phase 11)
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
    index('memories_key_idx').on(table.key),
    index('memories_user_key_idx').on(table.userId, table.key)
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

// Customer profiles (Phase 16)
export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    plan: text('plan'), // free, pro, enterprise
    accountAge: integer('account_age_days'),
    totalTickets: integer('total_tickets').default(0),
    avgSatisfaction: integer('avg_satisfaction'),
    tags: jsonb('tags').$type<string[]>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [index('customers_email_idx').on(table.email), index('customers_plan_idx').on(table.plan)]
);

// Support tickets (Phase 16)
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: text('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull(),
    subject: text('subject').notNull(),
    status: ticketStatusEnum('status').default('open').notNull(),
    priority: priorityEnum('priority').default('medium').notNull(),
    category: text('category'), // billing, technical, account, general
    assignedTo: text('assigned_to'), // agent identifier or 'human'
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null'
    }),
    resolution: text('resolution'),
    satisfactionScore: integer('satisfaction_score'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>()
  },
  (table) => [
    index('tickets_customer_idx').on(table.customerId),
    index('tickets_status_idx').on(table.status),
    index('tickets_priority_idx').on(table.priority),
    index('tickets_category_idx').on(table.category),
    index('tickets_created_at_idx').on(table.createdAt)
  ]
);

// Knowledge base articles (Phase 16)
export const knowledgeArticles = pgTable(
  'knowledge_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(),
    tags: jsonb('tags').$type<string[]>(),
    viewCount: integer('view_count').default(0),
    helpfulCount: integer('helpful_count').default(0),
    notHelpfulCount: integer('not_helpful_count').default(0),
    status: articleStatusEnum('status').default('published').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    index('articles_category_idx').on(table.category),
    index('articles_status_idx').on(table.status)
  ]
);

// Export table types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;
export type UserMemory = typeof userMemories.$inferSelect;
export type NewUserMemory = typeof userMemories.$inferInsert;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type NewConversationSummary = typeof conversationSummaries.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type KnowledgeArticle = typeof knowledgeArticles.$inferSelect;
export type NewKnowledgeArticle = typeof knowledgeArticles.$inferInsert;
