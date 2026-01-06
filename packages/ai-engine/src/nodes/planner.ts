import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ResearchStateType } from '../graphs/state.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PlanSchema = z.object({
  steps: z.array(z.string()).describe('List of research steps to execute'),
  reasoning: z.string().describe('Why this plan makes sense'),
});

/**
 * Planning node - creates a research plan
 */
export async function plannerNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  console.log('[Planner] Creating research plan for:', state.query);

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: PlanSchema,
    prompt: `Create a research plan for this query: "${state.query}"

Consider:
- What information needs to be gathered?
- What sources should be consulted?
- What analysis is needed?

Create 3-5 concrete steps.`,
    temperature: 0.3,
  });

  console.log('[Planner] Plan created:', object.steps);

  return {
    plan: object.steps,
    currentStep: 0,
  };
}

/**
 * Re-planning node - revises plan based on reflection
 */
export async function replannerNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  console.log('[Replanner] Revising plan based on critique');

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: PlanSchema,
    prompt: `You are a Research Director.
Original query: "${state.query}"
Critique: ${state.critique}
Current analysis synopsis: ${state.analysis.slice(0, 500)}

You previously executed these steps:
${state.pastSteps.join('\n')}

Based on the critique, create a *new* plan of REMAINING steps to address the gaps.
- DO NOT re-include steps that are already completed and successful.
- Only include NEW steps or steps that need to be re-done differently.
- Keep the plan concise (1-3 steps).`,
    temperature: 0.3,
  });

  return {
    plan: object.steps,
    currentStep: 0,
    revisionCount: state.revisionCount + 1,
  };
}
