import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { runSupportSwarm, streamSupportSwarm } from '@insight-os/ai-engine/support';
import { MemoryManager } from '@insight-os/memory';
import { createTrace, createSpan } from '../lib/observability.js';
import { createResponse, createErrorResponse } from '@insight-os/shared';
import { db } from '../db/index.js';
import { customers, tickets, knowledgeArticles } from '@insight-os/db-schema';
import { eq, desc, and } from 'drizzle-orm';
import { queueDocumentIngestion } from '@insight-os/jobs';

export const supportRoutes = new Hono();

/**
 * POST /support/chat
 * Main support chat endpoint
 *
 * Flow:
 * 1. Validate input and load customer
 * 2. Load previous conversation history (before adding current message)
 * 3. Process message with support swarm
 * 4. Save both user message and assistant response after processing
 */
supportRoutes.post('/chat', async (c) => {
  try {
    const { customerId, message, conversationId } = await c.req.json<{
      customerId: string;
      message: string;
      conversationId?: string;
    }>();
    console.log('conversationId', conversationId);
    if (!customerId || !message) {
      return c.json(createErrorResponse('customerId and message are required'), 400);
    }

    const trace = createTrace('support_chat', { customerId, conversationId });

    // 1. Load customer data
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // 2. Initialize memory manager
    // Use provided conversationId or generate stable one for this customer's first message
    const sessionId = conversationId || `support_${customerId}_${Date.now()}`;
    const memory = new MemoryManager(customerId, sessionId);

    // 3. Load context BEFORE adding current message
    // This gets previous conversation history only
    const contextSpan = createSpan(trace, 'load_context', { customerId });
    const [previousContext, dbConversationId, pastTickets] = await Promise.all([
      memory.getContext(),
      memory.getConversationId(),
      db
        .select()
        .from(tickets)
        .where(eq(tickets.customerId, customerId))
        .orderBy(desc(tickets.createdAt))
        .limit(5)
    ]);

    contextSpan.end({
      output: {
        customerPlan: customer.plan,
        ticketCount: pastTickets.length,
        hasHistory: previousContext.length > 0
      }
    });

    // 4. Process message with support swarm
    const swarmSpan = createSpan(trace, 'support_swarm', { message });

    const result = await runSupportSwarm(message, {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name || undefined,
        plan: customer.plan || undefined,
        accountAge: customer.accountAge || undefined
      },
      context: previousContext,
      pastTickets: pastTickets.map((t) => ({
        subject: t.subject,
        category: t.category || 'general',
        resolution: t.resolution || undefined,
        createdAt: t.createdAt
      })),
      conversationId: dbConversationId
    });

    swarmSpan.end({
      output: {
        agentsUsed: result.agentsUsed,
        category: result.category,
        resolved: result.resolved
      }
    });

    // 5. Save conversation to database (both user message and assistant response)
    await Promise.all([
      memory.addMessage('user', message),
      memory.addMessage('assistant', result.response)
    ]);

    // 6. Update customer metrics if needed
    if (result.category) {
      await db
        .update(customers)
        .set({ totalTickets: (customer.totalTickets || 0) + 1 })
        .where(eq(customers.id, customerId));
    }

    trace.update({
      output: {
        agentsUsed: result.agentsUsed,
        resolved: result.resolved,
        requiresHuman: result.requiresHuman
      }
    });

    return c.json(
      createResponse({
        response: result.response,
        conversationId: sessionId, // Return conversationId for client to use in follow-ups
        agentsUsed: result.agentsUsed,
        category: result.category,
        resolved: result.resolved,
        requiresHuman: result.requiresHuman
      })
    );
  } catch (error) {
    console.error('[Support] Chat error:', error);
    return c.json(createErrorResponse('Support chat failed'), 500);
  }
});

/**
 * POST /support/chat/stream
 * Streaming support chat
 *
 * Flow:
 * 1. Load previous history before processing
 * 2. Stream agent responses
 * 3. Save both messages after stream completes
 */
supportRoutes.post('/chat/stream', async (c) => {
  try {
    const { customerId, message, conversationId } = await c.req.json<{
      customerId: string;
      message: string;
      conversationId?: string;
    }>();

    if (!customerId || !message) {
      return c.json(createErrorResponse('customerId and message are required'), 400);
    }

    // 1. Load customer data
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // 2. Initialize memory and load previous context
    const sessionId = conversationId || `support_${customerId}_${Date.now()}`;
    const memory = new MemoryManager(customerId, sessionId);

    const [previousContext, pastTickets] = await Promise.all([
      memory.getContext(),
      db
        .select()
        .from(tickets)
        .where(eq(tickets.customerId, customerId))
        .orderBy(desc(tickets.createdAt))
        .limit(5)
    ]);

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const generator = streamSupportSwarm(message, {
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name || undefined,
          plan: customer.plan || undefined,
          accountAge: customer.accountAge || undefined
        },
        context: previousContext,
        pastTickets: pastTickets.map((t) => ({
          subject: t.subject,
          category: t.category || 'general',
          resolution: t.resolution || undefined,
          createdAt: t.createdAt
        }))
      });

      let fullResponse = '';
      for await (const event of generator) {
        await stream.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'agent_output' && event.content) {
          fullResponse = event.content;
        }
      }

      await stream.write('data: [DONE]\n\n');

      // Save both user message and assistant response after stream completes
      if (fullResponse) {
        await Promise.all([
          memory.addMessage('user', message),
          memory.addMessage('assistant', fullResponse)
        ]);
      }
    });
  } catch (error) {
    console.error('[Support] Stream error:', error);
    return c.json(createErrorResponse('Stream failed'), 500);
  }
});

/**
 * POST /support/customers
 * Create or update customer
 */
supportRoutes.post('/customers', async (c) => {
  try {
    const customerData = await c.req.json<{
      id: string;
      email: string;
      name?: string;
      plan?: string;
      metadata?: Record<string, unknown>;
    }>();

    const [customer] = await db
      .insert(customers)
      .values({
        ...customerData,
        accountAge: 0,
        totalTickets: 0
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          email: customerData.email,
          name: customerData.name,
          plan: customerData.plan,
          metadata: customerData.metadata
        }
      })
      .returning();

    return c.json(createResponse(customer));
  } catch (error) {
    console.error('[Support] Create customer error:', error);
    return c.json(createErrorResponse('Failed to create customer'), 500);
  }
});

/**
 * GET /support/customers/:id
 * Get customer details
 * Ensures customer can only see their own data
 */
supportRoutes.get('/customers/:id', async (c) => {
  try {
    const customerId = c.req.param('id');

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // Get tickets - only this customer's tickets
    const customerTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.createdAt));

    // Get conversations - only this customer's conversations
    const { MemoryManager } = await import('@insight-os/memory');
    const conversations = await MemoryManager.getUserConversations(customerId);

    return c.json(
      createResponse({
        ...customer,
        tickets: customerTickets,
        conversations
      })
    );
  } catch (error) {
    console.error('[Support] Get customer error:', error);
    return c.json(createErrorResponse('Failed to get customer'), 500);
  }
});

/**
 * POST /support/knowledge/ingest
 * Ingest knowledge base articles
 */
supportRoutes.post('/knowledge/ingest', async (c) => {
  try {
    const { articles } = await c.req.json<{
      articles: Array<{
        title: string;
        content: string;
        category: string;
        tags?: string[];
        status?: 'draft' | 'published' | 'archived';
      }>;
    }>();

    if (!articles || !Array.isArray(articles)) {
      return c.json(createErrorResponse('articles array is required'), 400);
    }

    const ingested = [];

    for (const article of articles) {
      // Insert article
      const [stored] = await db
        .insert(knowledgeArticles)
        .values({
          title: article.title,
          content: article.content,
          category: article.category,
          tags: article.tags || [],
          status: article.status || 'published'
        })
        .returning();

      // Queue embedding generation
      await queueDocumentIngestion('ingest_text', {
        documentId: stored.id,
        name: article.title,
        content: article.content,
        options: {
          metadata: {
            type: 'knowledge_article',
            category: article.category,
            tags: article.tags || []
          }
        }
      });

      ingested.push(stored);
    }

    return c.json(
      createResponse({
        ingested: ingested.length,
        articles: ingested
      })
    );
  } catch (error) {
    console.error('[Support] Ingest knowledge error:', error);
    return c.json(createErrorResponse('Failed to ingest articles'), 500);
  }
});

/**
 * GET /support/knowledge
 * List knowledge base articles
 */
supportRoutes.get('/knowledge', async (c) => {
  try {
    const category = c.req.query('category');
    const status = c.req.query('status') as 'draft' | 'published' | 'archived' | undefined;

    let query = db.select().from(knowledgeArticles).$dynamic();
    const conditions = [];

    if (category) {
      conditions.push(eq(knowledgeArticles.category, category));
    }
    if (status) {
      conditions.push(eq(knowledgeArticles.status, status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const articles = await query.orderBy(desc(knowledgeArticles.createdAt)).limit(50);

    return c.json(
      createResponse({
        articles,
        count: articles.length
      })
    );
  } catch (error) {
    console.error('[Support] Get knowledge error:', error);
    return c.json(createErrorResponse('Failed to get articles'), 500);
  }
});

/**
 * GET /support/tickets
 * List tickets with filters
 */
supportRoutes.get('/tickets', async (c) => {
  try {
    const customerId = c.req.query('customerId');
    const status = c.req.query('status') as
      | 'open'
      | 'pending'
      | 'resolved'
      | 'escalated'
      | undefined;
    const category = c.req.query('category');

    let query = db.select().from(tickets).$dynamic();

    const conditions = [];
    if (customerId) conditions.push(eq(tickets.customerId, customerId));
    if (status) conditions.push(eq(tickets.status, status));
    if (category) conditions.push(eq(tickets.category, category));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(tickets.createdAt)).limit(100);

    return c.json(
      createResponse({
        tickets: results,
        count: results.length
      })
    );
  } catch (error) {
    console.error('[Support] Get tickets error:', error);
    return c.json(createErrorResponse('Failed to get tickets'), 500);
  }
});
