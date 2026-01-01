import { generateObject } from 'ai';
import { openai, MODELS } from './ai.js';
import { TaskClassificationSchema, type TaskClassification } from '@insight-os/shared';

interface RouterResult {
  model: string;
  classification: TaskClassification;
}

const ROUTER_SYSTEM = `You are a task classifier for an AI system.
Analyze the user's request and classify it to route to the appropriate model.

Task types:
- simple_question: Basic factual queries, definitions
- company_analysis: In-depth company research, SWOT
- market_research: Industry/market analysis
- competitive_analysis: Comparing multiple companies
- trend_analysis: Analyzing market trends
- general_chat: Casual conversation, greetings

Model recommendations:
- fast: Simple questions, general chat
- smart: Company analysis, market research, competitive analysis
- reasoning: Complex multi-step analysis, trend predictions`;

/**
 * Automatically route a request to the best model
 */
export async function routeRequest(userMessage: string): Promise<RouterResult> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'), // Use fast model for routing
      schema: TaskClassificationSchema,
      system: ROUTER_SYSTEM,
      prompt: `Classify this user request:\n\n"${userMessage}"`,
      temperature: 0
    });

    return {
      model: MODELS[object.suggestedModel],
      classification: object
    };
  } catch (error) {
    // Fallback to smart model on error
    console.error('Router error:', error);
    return {
      model: MODELS.smart,
      classification: {
        taskType: 'general_chat',
        complexity: 'medium',
        requiresReasoning: false,
        suggestedModel: 'smart',
        confidence: 0
      }
    };
  }
}

/**
 * Manual model selection based on simple heuristics
 * (faster than LLM-based routing for simple cases)
 */
export function quickRoute(userMessage: string): string {
  const message = userMessage.toLowerCase();

  // Simple patterns for fast model
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you)/,
    /^what (is|are) /,
    /^define /,
    /^explain briefly/
  ];

  if (simplePatterns.some((p) => p.test(message))) {
    return MODELS.fast;
  }

  // Complex patterns for reasoning model
  const complexPatterns = [
    /compare.*and.*and/i, // Multiple comparisons
    /predict|forecast|future/i,
    /strategy|strategic/i,
    /investment thesis/i
  ];

  if (complexPatterns.some((p) => p.test(message))) {
    return MODELS.reasoning;
  }

  // Default to smart model
  return MODELS.smart;
}

/**
 * Hybrid routing: quick heuristics + LLM fallback
 */
export async function hybridRoute(
  userMessage: string,
  options?: { forceClassify?: boolean }
): Promise<RouterResult> {
  // Use quick route for obvious cases
  if (!options?.forceClassify) {
    const quickModel = quickRoute(userMessage);
    if (quickModel === MODELS.fast || quickModel === MODELS.reasoning) {
      return {
        model: quickModel,
        classification: {
          taskType: 'general_chat',
          complexity: quickModel === MODELS.fast ? 'low' : 'high',
          requiresReasoning: quickModel === MODELS.reasoning,
          suggestedModel: quickModel === MODELS.fast ? 'fast' : 'reasoning',
          confidence: 0.8
        }
      };
    }
  }

  // Fall back to LLM classification
  return routeRequest(userMessage);
}
