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
 */
supportRoutes.post('/chat', async (c) => {
  try {
    const { customerId, message, conversationId } = await c.req.json<{
      customerId: string;
      message: string;
      conversationId?: string;
    }>();

    if (!customerId || !message) {
      return c.json(createErrorResponse('customerId and message are required'), 400);
    }

    const trace = createTrace('support_chat', { customerId, conversationId });
    const contextSpan = createSpan(trace, 'load_context', { customerId });

    // Load customer data
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // Load memory
    const memory = new MemoryManager(customerId, conversationId || `support_${Date.now()}`);
    await memory.addMessage('user', message);
    const context = await memory.getContext();

    // Get DB conversation ID for linking tickets
    const dbConversationId = await memory.getConversationId();

    // Get past tickets
    const pastTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

    contextSpan.end({ output: { customerPlan: customer.plan, ticketCount: pastTickets.length } });

    // Run support swarm
    const swarmSpan = createSpan(trace, 'support_swarm', { message });

    const result = await runSupportSwarm(message, {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name || undefined,
        plan: customer.plan || undefined,
        accountAge: customer.accountAge || undefined
      },
      context,
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

    // Update memory (user message already added, just add assistant response)
    await memory.addMessage('assistant', result.response);

    // Update customer ticket count
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

    // Load customer data
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // Load memory
    const memory = new MemoryManager(customerId, conversationId || `support_${Date.now()}`);
    await memory.addMessage('user', message);
    const context = await memory.getContext();

    // Get DB conversation ID for linking tickets
    const dbConversationId = await memory.getConversationId();

    // Get past tickets
    const pastTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

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

      // Save assistant response to memory
      if (fullResponse) {
        await memory.addMessage('assistant', fullResponse);
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
