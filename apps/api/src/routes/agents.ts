import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { runResearchAgent, streamResearchAgent } from '@insight-os/ai-engine/agents';
import { allTools } from '@insight-os/ai-engine/tools';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const agentsRoutes = new Hono();

/**
 * GET /agents/tools
 * List available tools
 */
agentsRoutes.get('/tools', (c) => {
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return c.json(createResponse({ tools }));
});

/**
 * POST /agents/research
 * Run research agent
 */
agentsRoutes.post('/research', async (c) => {
  try {
    const { query, maxIterations, tools } = await c.req.json<{
      query: string;
      maxIterations?: number;
      tools?: string[];
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const result = await runResearchAgent({
      query,
      maxIterations,
      tools,
    });

    return c.json(createResponse(result));
  } catch (error) {
    console.error('Research agent error:', error);
    return c.json(createErrorResponse('Agent execution failed'), 500);
  }
});

/**
 * POST /agents/research/stream
 * Stream research agent execution
 */
agentsRoutes.post('/research/stream', async (c) => {
  try {
    const { query, maxIterations } = await c.req.json<{
      query: string;
      maxIterations?: number;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const generator = streamResearchAgent({ query, maxIterations });

      for await (const event of generator) {
        await stream.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      await stream.write('data: [DONE]\n\n');
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json(createErrorResponse('Stream failed'), 500);
  }
});

/**
 * POST /agents/tool/execute
 * Execute a single tool
 */
agentsRoutes.post('/tool/execute', async (c) => {
  try {
    const { tool: toolName, args } = await c.req.json<{
      tool: string;
      args: Record<string, unknown>;
    }>();

    if (!toolName || !args) {
      return c.json(createErrorResponse('Tool name and args are required'), 400);
    }

    const tool = allTools[toolName as keyof typeof allTools];
    if (!tool) {
      return c.json(createErrorResponse(`Unknown tool: ${toolName}`), 400);
    }

    // Execute tool
    const result = await (tool as any).execute(args);

    return c.json(createResponse({
      tool: toolName,
      args,
      result,
    }));
  } catch (error) {
    console.error('Tool execution error:', error);
    return c.json(createErrorResponse('Tool execution failed'), 500);
  }
});

