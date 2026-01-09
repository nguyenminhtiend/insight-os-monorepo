import { createOpenAI } from '@ai-sdk/openai';
import { createTrace, tracedLLMCall } from './observability.js';

// Initialize OpenAI provider
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Default model configuration
export const DEFAULT_MODEL = 'gpt-4o-mini';

// System prompts
export const SYSTEM_PROMPTS = {
  default: `You are InsightOS, a strategic market intelligence assistant.
You help users analyze markets, companies, and competitive landscapes.
Be concise, data-driven, and actionable in your responses.`,

  analyst: `You are a senior market analyst at InsightOS.
Provide detailed analysis with specific data points and citations where possible.
Structure your responses with clear sections and bullet points.`
};

// Model options for different use cases
export const MODELS = {
  fast: 'gpt-4o-mini', // Quick responses, lower cost
  smart: 'gpt-4o-mini', // Complex analysis
  reasoning: 'gpt-4o-mini' // Deep reasoning tasks (using gpt-4o since o1 models have limited availability)
} as const;

export type ModelType = keyof typeof MODELS;

/**
 * Traced text generation
 */
export async function tracedGenerateText(
  traceName: string,
  options: {
    model: string;
    system?: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ result: any; trace: any }> {
  const trace = createTrace(traceName);

  const result = await tracedLLMCall(
    trace,
    'generateText',
    async () => {
      const { generateText } = await import('ai');
      return generateText({
        model: openai(options.model),
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        ...(options.maxTokens && { maxRetries: options.maxTokens })
      });
    },
    {
      model: options.model,
      input: { system: options.system, prompt: options.prompt }
    }
  );

  return { result, trace };
}
