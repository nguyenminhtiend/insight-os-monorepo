import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  conversations,
  messages,
  eq,
  desc,
  type NewConversation,
  type NewMessage
} from '@insight-os/db-schema';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const conversationsRoutes = new Hono();

/**
 * GET /conversations
 * List all conversations
 */
conversationsRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const results = await db
      .select()
      .from(conversations)
      .where(eq(conversations.status, 'active'))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    return c.json(
      createResponse({
        conversations: results,
        pagination: { limit, offset }
      })
    );
  } catch (error) {
    console.error('List conversations error:', error);
    return c.json(createErrorResponse('Failed to list conversations'), 500);
  }
});

/**
 * POST /conversations
 * Create a new conversation
 */
conversationsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<{ title?: string; metadata?: Record<string, unknown> }>();

    const newConversation: NewConversation = {
      title: body.title || 'New Conversation',
      metadata: body.metadata
    };

    const [created] = await db.insert(conversations).values(newConversation).returning();

    return c.json(createResponse(created), 201);
  } catch (error) {
    console.error('Create conversation error:', error);
    return c.json(createErrorResponse('Failed to create conversation'), 500);
  }
});

/**
 * GET /conversations/:id
 * Get a conversation with its messages
 */
conversationsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (conversation.length === 0) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    return c.json(
      createResponse({
        ...conversation[0],
        messages: conversationMessages
      })
    );
  } catch (error) {
    console.error('Get conversation error:', error);
    return c.json(createErrorResponse('Failed to get conversation'), 500);
  }
});

/**
 * POST /conversations/:id/messages
 * Add a message to a conversation
 */
conversationsRoutes.post('/:id/messages', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      metadata?: Record<string, unknown>;
    }>();

    // Verify conversation exists
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (conversation.length === 0) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    const newMessage: NewMessage = {
      conversationId: id,
      role: body.role,
      content: body.content,
      metadata: body.metadata
    };

    const [created] = await db.insert(messages).values(newMessage).returning();

    // Update conversation timestamp
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

    return c.json(createResponse(created), 201);
  } catch (error) {
    console.error('Add message error:', error);
    return c.json(createErrorResponse('Failed to add message'), 500);
  }
});

/**
 * DELETE /conversations/:id
 * Soft delete a conversation
 */
conversationsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const [updated] = await db
      .update(conversations)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    if (!updated) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    return c.json(createResponse({ deleted: true }));
  } catch (error) {
    console.error('Delete conversation error:', error);
    return c.json(createErrorResponse('Failed to delete conversation'), 500);
  }
});

/**
 * PATCH /conversations/:id
 * Update conversation title/metadata
 */
conversationsRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      title?: string;
      metadata?: Record<string, unknown>;
    }>();

    const [updated] = await db
      .update(conversations)
      .set({
        ...(body.title && { title: body.title }),
        ...(body.metadata && { metadata: body.metadata }),
        updatedAt: new Date()
      })
      .where(eq(conversations.id, id))
      .returning();

    if (!updated) {
      return c.json(createErrorResponse('Conversation not found'), 404);
    }

    return c.json(createResponse(updated));
  } catch (error) {
    console.error('Update conversation error:', error);
    return c.json(createErrorResponse('Failed to update conversation'), 500);
  }
});

