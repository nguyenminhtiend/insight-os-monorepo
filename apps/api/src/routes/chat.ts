import { Hono } from 'hono';
import { streamText, generateText } from 'ai';
import { stream } from 'hono/streaming';
import { openai, DEFAULT_MODEL, SYSTEM_PROMPTS, MODELS, type ModelType } from '../lib/ai.js';
import {
  createResponse,
  createErrorResponse,
  generateId,
  type ChatRequest,
} from '@insight-os/shared';

export const chatRoutes = new Hono();

/**
 * POST /chat
 * Non-streaming chat completion
 */
chatRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<ChatRequest>();
    const { messages, model = DEFAULT_MODEL } = body;

    if (!messages || messages.length === 0) {
      return c.json(createErrorResponse('Messages are required'), 400);
    }

    const result = await generateText({
      model: openai(model),
      system: SYSTEM_PROMPTS.default,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    return c.json(
      createResponse({
        id: generateId(),
        message: {
          id: generateId(),
          role: 'assistant' as const,
          content: result.text,
          createdAt: new Date(),
        },
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      }),
    );
  } catch (error) {
    console.error('Chat error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Unknown error'),
      500,
    );
  }
});

/**
 * POST /chat/stream
 * Streaming chat completion using SSE
 */
chatRoutes.post('/stream', async (c) => {
  try {
    const body = await c.req.json<ChatRequest>();
    const { messages, model = DEFAULT_MODEL } = body;

    if (!messages || messages.length === 0) {
      return c.json(createErrorResponse('Messages are required'), 400);
    }

    const result = streamText({
      model: openai(model),
      system: SYSTEM_PROMPTS.default,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Return streaming response
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const reader = result.textStream;

      for await (const chunk of reader) {
        await stream.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      await stream.write('data: [DONE]\n\n');
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Unknown error'),
      500,
    );
  }
});

/**
 * GET /chat/models
 * List available models
 */
chatRoutes.get('/models', (c) => {
  return c.json(
    createResponse({
      models: Object.entries(MODELS).map(([key, value]) => ({
        id: key,
        name: value,
        description: getModelDescription(key as ModelType),
      })),
      default: DEFAULT_MODEL,
    }),
  );
});

function getModelDescription(type: ModelType): string {
  switch (type) {
    case 'fast':
      return 'Quick responses, lower cost. Best for simple queries.';
    case 'smart':
      return 'Complex analysis and detailed responses.';
    case 'reasoning':
      return 'Deep reasoning for complex problems.';
  }
}
