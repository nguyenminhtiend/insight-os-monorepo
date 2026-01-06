import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ResearchStateType } from '../graphs/state.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ReflectionSchema = z.object({
  critique: z.string().describe('Detailed critique of the analysis'),
  issues: z.array(z.string()).describe('Specific issues found'),
  shouldRevise: z.boolean().describe('Whether revision is needed'),
  confidence: z.number().min(0).max(1).describe('Confidence in the analysis'),
});

/**
 * Reflector node - critiques the analysis
 */
export async function reflectorNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  console.log('[Reflector] Evaluating analysis quality');

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: ReflectionSchema,
    prompt: `Evaluate this research analysis for quality and completeness.

Original query: "${state.query}"

Analysis:
${state.analysis}

Consider:
- Does it fully answer the query?
- Is it accurate and well-supported?
- Are there gaps or missing information?
- Is the reasoning sound?

Be critical but fair. Only suggest revision if there are significant issues.
Revision count so far: ${state.revisionCount} (max: 2)`,
    temperature: 0.2,
  });

  // Limit revisions to prevent infinite loops
  const shouldRevise = object.shouldRevise && state.revisionCount < 2;

  console.log('[Reflector] Result:', {
    shouldRevise,
    confidence: object.confidence,
    issues: object.issues.length,
  });

  return {
    critique: object.critique,
    shouldRevise,
    confidence: object.confidence,
  };
}

/**
 * Finalizer node - produces final answer
 */
export async function finalizerNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  console.log('[Finalizer] Producing final answer');

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Create the final answer based on this analysis.

Query: "${state.query}"

Analysis:
${state.analysis}

${state.critique ? `Reviewer notes: ${state.critique}` : ''}

Provide a clear, well-structured final answer. Include key findings and confidence level.`,
    temperature: 0.2,
    maxTokens: 2000,
  });

  return {
    finalAnswer: result.text,
    shouldRevise: false,
  };
}
