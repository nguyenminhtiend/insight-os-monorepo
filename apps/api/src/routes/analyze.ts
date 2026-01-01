import { Hono } from 'hono';
import { generateText, streamText, Output } from 'ai';
import { stream } from 'hono/streaming';
import { openai, MODELS } from '../lib/ai.js';
import { getPrompt, interpolate, listPrompts } from '../lib/prompts/index.js';
import { hybridRoute } from '../lib/router.js';
import {
  createResponse,
  createErrorResponse,
  CompanyAnalysisSchema,
  ResearchOutputSchema,
  type CompanyAnalysis,
} from '@insight-os/shared';

export const analyzeRoutes = new Hono();

/**
 * GET /analyze/prompts
 * List available prompt templates
 */
analyzeRoutes.get('/prompts', (c) => {
  return c.json(createResponse(listPrompts()));
});

/**
 * POST /analyze/company
 * Structured company analysis
 */
analyzeRoutes.post('/company', async (c) => {
  try {
    const { company, additionalContext = '' } = await c.req.json<{
      company: string;
      additionalContext?: string;
    }>();

    if (!company) {
      return c.json(createErrorResponse('Company name is required'), 400);
    }

    const prompt = getPrompt('analyst.company');
    if (!prompt) {
      return c.json(createErrorResponse('Prompt template not found'), 500);
    }

    const userMessage = interpolate(prompt.userTemplate || '', {
      company,
      additionalContext,
    });

    const { output: object, usage } = await generateText({
      model: openai(MODELS.smart),
      output: Output.object({ schema: CompanyAnalysisSchema }),
      system: prompt.system,
      prompt: userMessage,
      temperature: prompt.temperature,
    });

    return c.json(
      createResponse({
        analysis: object,
        promptUsed: prompt.id,
        usage: {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
        },
      }),
    );
  } catch (error) {
    console.error('Company analysis error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Analysis failed'),
      500,
    );
  }
});

/**
 * POST /analyze/company/stream
 * Streaming company analysis with partial JSON
 */
analyzeRoutes.post('/company/stream', async (c) => {
  try {
    const { company, additionalContext = '' } = await c.req.json<{
      company: string;
      additionalContext?: string;
    }>();

    if (!company) {
      return c.json(createErrorResponse('Company name is required'), 400);
    }

    const prompt = getPrompt('analyst.company');
    if (!prompt) {
      return c.json(createErrorResponse('Prompt template not found'), 500);
    }

    const userMessage = interpolate(prompt.userTemplate || '', {
      company,
      additionalContext,
    });

    // Use streamText with Output.object instead of the deprecated streamObject
    const result = streamText({
      model: openai(MODELS.smart),
      output: Output.object({ schema: CompanyAnalysisSchema }),
      system: prompt.system,
      prompt: userMessage,
      temperature: prompt.temperature,
    });

    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Stream failed'),
      500,
    );
  }
});

/**
 * POST /analyze/research
 * General research with structured output
 */
analyzeRoutes.post('/research', async (c) => {
  try {
    const { query, type = 'market' } = await c.req.json<{
      query: string;
      type?: 'market' | 'trend' | 'summary';
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    const prompt = getPrompt(`research.${type}`);
    if (!prompt) {
      return c.json(createErrorResponse(`Unknown research type: ${type}`), 400);
    }

    const { output: object, usage } = await generateText({
      model: openai(MODELS.smart),
      output: Output.object({ schema: ResearchOutputSchema }),
      system: prompt.system,
      prompt: interpolate(prompt.userTemplate || '', {
        market: query,
        trend: query,
        content: query,
        specificQuestions: '',
      }),
      temperature: prompt.temperature,
    });

    return c.json(
      createResponse({
        research: object,
        promptUsed: prompt.id,
        usage: {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
        },
      }),
    );
  } catch (error) {
    console.error('Research error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Research failed'),
      500,
    );
  }
});

/**
 * POST /analyze/auto
 * Auto-routed analysis (model selected automatically)
 */
analyzeRoutes.post('/auto', async (c) => {
  try {
    const { query, forceClassify = false } = await c.req.json<{
      query: string;
      forceClassify?: boolean;
    }>();

    if (!query) {
      return c.json(createErrorResponse('Query is required'), 400);
    }

    // Route to best model
    const { model, classification } = await hybridRoute(query, { forceClassify });

    // Generate response with selected model
    const result = await generateText({
      model: openai(model),
      prompt: query,
      temperature: 0.4,
    });

    return c.json(
      createResponse({
        response: result.text,
        routing: {
          model,
          classification,
        },
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      }),
    );
  } catch (error) {
    console.error('Auto analysis error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Analysis failed'),
      500,
    );
  }
});
