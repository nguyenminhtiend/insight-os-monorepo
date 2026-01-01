import { createOpenAI } from '@ai-sdk/openai';

// Initialize OpenAI provider
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
Structure your responses with clear sections and bullet points.`,
};

// Model options for different use cases
export const MODELS = {
  fast: 'gpt-4o-mini', // Quick responses, lower cost
  smart: 'gpt-4o', // Complex analysis
  reasoning: 'gpt-4o', // Deep reasoning tasks (using gpt-4o since o1 models have limited availability)
} as const;

export type ModelType = keyof typeof MODELS;
