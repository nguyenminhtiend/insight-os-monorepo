import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { runResearchAgent, streamResearchAgent } from '@insight-os/ai-engine/agents';
import { runResearchWorkflow, streamResearchWorkflow, runHITLWorkflow, resumeHITLWorkflow } from '@insight-os/ai-engine/graphs';
import { allTools } from '@insight-os/ai-engine/tools';
import { getPendingApprovals, resolveApproval } from '@insight-os/ai-engine/hitl';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const agentsRoutes = new Hono();

/**
 * GET /agents/tools
 * List available tools
 */
agentsRoutes.get('/tools', (c) => {
  console.log('Tool');
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters
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
      tools
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

    return c.json(
      createResponse({
        tool: toolName,
        args,
        result
      })
    );
  } catch (error) {
    console.error('Tool execution error:', error);
    return c.json(createErrorResponse('Tool execution failed'), 500);
  }
});

/**
 * POST /agents/workflow/research
 * Run Plan→Act→Reflect research workflow
 */
agentsRoutes.post('/workflow/research', async (c) => {
  try {
    const { query } = await c.req.json<{ query: string }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const result = await runResearchWorkflow(query);

    return c.json(createResponse(result));
  } catch (error) {
    console.error('Workflow error:', error);
    return c.json(createErrorResponse('Workflow execution failed'), 500);
  }
});

/**
 * POST /agents/workflow/research/stream
 * Stream workflow execution
 */
agentsRoutes.post('/workflow/research/stream', async (c) => {
  try {
    const { query } = await c.req.json<{ query: string }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const generator = streamResearchWorkflow(query);

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
 * GET /agents/approvals
 * List pending approval requests
 */
agentsRoutes.get('/approvals', (c) => {
  const workflowId = c.req.query('workflowId');
  const approvals = getPendingApprovals(workflowId);
  return c.json(createResponse({ approvals }));
});

/**
 * POST /agents/approvals/:id/resolve
 * Approve or reject a pending request
 */
agentsRoutes.post('/approvals/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const { approved, feedback } = await c.req.json<{
      approved: boolean;
      feedback?: string;
    }>();

    const result = await resolveApproval(id, approved, 'user', feedback);

    if (!result) {
      return c.json(createErrorResponse('Approval request not found'), 404);
    }

    return c.json(createResponse(result));
  } catch (error) {
    return c.json(createErrorResponse('Failed to resolve approval'), 500);
  }
});

/**
 * POST /agents/workflow/hitl
 * Run workflow with human-in-the-loop
 */
agentsRoutes.post('/workflow/hitl', async (c) => {
  try {
    const { query, threadId } = await c.req.json<{
      query: string;
      threadId?: string;
    }>();

    const result = await runHITLWorkflow(query, threadId);
    return c.json(createResponse(result));
  } catch (error) {
    console.error('HITL workflow error:', error);
    return c.json(createErrorResponse('Workflow failed'), 500);
  }
});

/**
 * POST /agents/workflow/hitl/resume
 * Resume workflow after approval
 */
agentsRoutes.post('/workflow/hitl/resume', async (c) => {
  try {
    const { threadId, approved } = await c.req.json<{
      threadId: string;
      approved: boolean;
    }>();

    const result = await resumeHITLWorkflow('', threadId, approved);
    return c.json(createResponse(result));
  } catch (error) {
    return c.json(createErrorResponse('Resume failed'), 500);
  }
});
