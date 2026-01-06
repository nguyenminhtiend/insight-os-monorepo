import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { ResearchStateType } from '../graphs/state.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Executor node - executes current plan step
 */
export async function executorNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  const currentStep = state.plan[state.currentStep];
  console.log(`[Executor] Executing step ${state.currentStep + 1}: ${currentStep}`);

  // Simulate search/research for the step
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: `Execute this research step: "${currentStep}"

Query context: "${state.query}"
Previous findings: ${state.searchResults.slice(-3).join('\n')}

Provide detailed findings for this step.`,
    temperature: 0.4,
    maxTokens: 1000,
  });

  return {
    searchResults: [result.text],
    pastSteps: [currentStep],
    currentStep: state.currentStep + 1,
  };
}

/**
 * Analyzer node - synthesizes gathered information
 */
export async function analyzerNode(state: ResearchStateType): Promise<Partial<ResearchStateType>> {
  console.log('[Analyzer] Synthesizing research findings');

  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: `Synthesize these research findings into a comprehensive analysis.

Original query: "${state.query}"

Research findings:
${state.searchResults.map((r, i) => `[${i + 1}] ${r}`).join('\n\n')}

Provide a well-structured analysis that answers the query.`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  return {
    analysis: result.text,
  };
}
