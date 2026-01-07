import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { allTools } from '../tools/index.js';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ResearchTask {
  query: string;
  maxIterations?: number;
  tools?: string[];
}

export interface ResearchResult {
  query: string;
  answer: string;
  steps: Array<{
    thought: string;
    action?: string;
    actionInput?: unknown;
    observation?: string;
  }>;
  iterations: number;
  toolsUsed: string[];
}

const RESEARCH_SYSTEM_PROMPT = `You are a research agent that helps users find and analyze information.
You have access to various tools to search for information and perform analysis.

When given a research query:
1. Think about what information you need
2. Use appropriate tools to gather information
3. Analyze and synthesize the results
4. Provide a comprehensive answer

Available tools will be provided. Use them when needed.
Always cite your sources and be transparent about limitations.`;

/**
 * Simple research agent using tool calling
 */
export async function runResearchAgent(task: ResearchTask): Promise<ResearchResult> {
  const { query, maxIterations = 5, tools: toolNames } = task;

  // Select tools
  const selectedTools = toolNames
    ? Object.fromEntries(Object.entries(allTools).filter(([name]) => toolNames.includes(name)))
    : allTools;

  const steps: ResearchResult['steps'] = [];
  const toolsUsed: string[] = [];
  let iterations = 0;
  let finalAnswer = '';

  // Initial generation with tools
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: RESEARCH_SYSTEM_PROMPT,
    prompt: query,
    tools: selectedTools,
    maxSteps: maxIterations,
    onStepFinish: ({ text, toolCalls, toolResults }) => {
      iterations++;

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          steps.push({
            thought: `Need to use ${call.toolName}`,
            action: call.toolName,
            actionInput: call.args,
          });

          if (!toolsUsed.includes(call.toolName)) {
            toolsUsed.push(call.toolName);
          }
        }
      }

      if (toolResults && toolResults.length > 0) {
        for (const result of toolResults) {
          steps.push({
            thought: 'Processing tool result',
            observation: JSON.stringify(result.result).slice(0, 500),
          });
        }
      }

      if (text) {
        steps.push({
          thought: text.slice(0, 200),
        });
      }
    },
  });

  finalAnswer = result.text;

  return {
    query,
    answer: finalAnswer,
    steps,
    iterations,
    toolsUsed,
  };
}

/**
 * Research agent with streaming
 */
export async function* streamResearchAgent(task: ResearchTask): AsyncGenerator<{
  type: 'thought' | 'action' | 'observation' | 'answer';
  content: string;
}> {
  const { query, maxIterations = 5 } = task;

  yield { type: 'thought', content: `Starting research on: "${query}"` };

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: RESEARCH_SYSTEM_PROMPT,
    prompt: query,
    tools: allTools,
    maxSteps: maxIterations,
  });

  // In a real implementation, you'd yield intermediate steps
  yield { type: 'answer', content: result.text };
}


