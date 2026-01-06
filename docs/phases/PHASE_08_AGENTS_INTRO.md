# Phase 8: Agents Intro - LangGraph & Tools

> **Goal:** Introduce agentic capabilities with LangGraph.js, implement basic tool calling, and create a simple research agent.

---

## Prerequisites

- Phase 7 completed (advanced RAG with reranking)
- Understanding of agent concepts

---

## Tech Stack Additions

| Tool             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| LangGraph.js     | Agent orchestration framework            |
| Tool calling     | Function calling with structured outputs |
| State management | Graph-based state machine                |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── packages/
│   └── ai-engine/                      # NEW: Agent package
│       ├── src/
│       │   ├── index.ts
│       │   ├── tools/
│       │   │   ├── index.ts
│       │   │   ├── search.ts
│       │   │   ├── analyze.ts
│       │   │   └── calculate.ts
│       │   ├── agents/
│       │   │   ├── index.ts
│       │   │   └── research.ts
│       │   └── graphs/
│       │       └── research-graph.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── api/
│       └── src/
│           └── routes/
│               └── agents.ts           # NEW: Agent API
```

---

## Implementation Steps

### Step 1: Create AI Engine Package

**1.1 Create `packages/ai-engine/package.json`:**

```json
{
  "name": "@insight-os/ai-engine",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./tools": {
      "types": "./src/tools/index.ts",
      "default": "./src/tools/index.ts"
    },
    "./agents": {
      "types": "./src/agents/index.ts",
      "default": "./src/agents/index.ts"
    }
  },
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^0.3.0",
    "@langchain/openai": "^0.3.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

**1.2 Create `packages/ai-engine/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

### Step 2: Create Tools

**2.1 Create `packages/ai-engine/src/tools/search.ts`:**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Web search tool (simulated - replace with actual API)
 */
export const webSearchTool = tool({
  description: 'Search the web for current information about a topic',
  parameters: z.object({
    query: z.string().describe('The search query'),
    maxResults: z.number().optional().default(5).describe('Maximum number of results'),
  }),
  execute: async ({ query, maxResults }) => {
    // In production, integrate with Tavily, Serper, or similar
    console.log(`[Tool] Web search: "${query}"`);

    // Simulated results for demo
    return {
      results: [
        {
          title: `Search result for: ${query}`,
          snippet: `This is a simulated search result about ${query}. In production, integrate with a real search API.`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        },
      ],
      query,
      totalResults: 1,
    };
  },
});

/**
 * RAG search tool - searches internal documents
 */
export const ragSearchTool = tool({
  description: 'Search internal knowledge base for relevant information',
  parameters: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().default(5).describe('Number of results'),
  }),
  execute: async ({ query, limit }) => {
    // This would integrate with the RAG service
    console.log(`[Tool] RAG search: "${query}"`);

    // Return interface - actual implementation uses RAG service
    return {
      chunks: [],
      query,
      message: 'RAG search tool - integrate with /rag/retrieve endpoint',
    };
  },
});
```

**2.2 Create `packages/ai-engine/src/tools/analyze.ts`:**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Company analysis tool
 */
export const analyzeCompanyTool = tool({
  description:
    'Analyze a company to get key information about their business, market position, and performance',
  parameters: z.object({
    company: z.string().describe('Company name to analyze'),
    aspects: z
      .array(z.enum(['overview', 'financials', 'competitors', 'products', 'news']))
      .optional()
      .default(['overview'])
      .describe('Aspects to analyze'),
  }),
  execute: async ({ company, aspects }) => {
    console.log(`[Tool] Analyzing company: ${company}, aspects: ${aspects.join(', ')}`);

    // In production, this would call the /analyze/company endpoint
    return {
      company,
      aspects,
      message: 'Company analysis tool - integrate with /analyze/company endpoint',
    };
  },
});

/**
 * Market trend analysis tool
 */
export const analyzeTrendTool = tool({
  description: 'Analyze a market trend to understand its impact and trajectory',
  parameters: z.object({
    trend: z.string().describe('The trend to analyze'),
    timeframe: z
      .enum(['short', 'medium', 'long'])
      .optional()
      .default('medium')
      .describe('Analysis timeframe'),
  }),
  execute: async ({ trend, timeframe }) => {
    console.log(`[Tool] Analyzing trend: ${trend}, timeframe: ${timeframe}`);

    return {
      trend,
      timeframe,
      message: 'Trend analysis tool - integrate with analysis service',
    };
  },
});
```

**2.3 Create `packages/ai-engine/src/tools/calculate.ts`:**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Calculator tool for numerical operations
 */
export const calculatorTool = tool({
  description: 'Perform mathematical calculations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate (e.g., "100 * 1.05")'),
  }),
  execute: async ({ expression }) => {
    console.log(`[Tool] Calculate: ${expression}`);

    try {
      // Safe evaluation (basic operations only)
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();

      return {
        expression,
        result,
        success: true,
      };
    } catch (error) {
      return {
        expression,
        error: 'Invalid expression',
        success: false,
      };
    }
  },
});

/**
 * Percentage change calculator
 */
export const percentageChangeTool = tool({
  description: 'Calculate percentage change between two values',
  parameters: z.object({
    oldValue: z.number().describe('The original value'),
    newValue: z.number().describe('The new value'),
  }),
  execute: async ({ oldValue, newValue }) => {
    const change = ((newValue - oldValue) / oldValue) * 100;

    return {
      oldValue,
      newValue,
      change: change.toFixed(2) + '%',
      direction: change >= 0 ? 'increase' : 'decrease',
    };
  },
});
```

**2.4 Create `packages/ai-engine/src/tools/index.ts`:**

```typescript
export * from './search.js';
export * from './analyze.js';
export * from './calculate.js';

import { webSearchTool, ragSearchTool } from './search.js';
import { analyzeCompanyTool, analyzeTrendTool } from './analyze.js';
import { calculatorTool, percentageChangeTool } from './calculate.js';

// All tools collection
export const allTools = {
  webSearch: webSearchTool,
  ragSearch: ragSearchTool,
  analyzeCompany: analyzeCompanyTool,
  analyzeTrend: analyzeTrendTool,
  calculator: calculatorTool,
  percentageChange: percentageChangeTool,
};

// Tool categories
export const searchTools = {
  webSearch: webSearchTool,
  ragSearch: ragSearchTool,
};

export const analysisTools = {
  analyzeCompany: analyzeCompanyTool,
  analyzeTrend: analyzeTrendTool,
};

export const utilityTools = {
  calculator: calculatorTool,
  percentageChange: percentageChangeTool,
};
```

---

### Step 3: Create Research Agent

**3.1 Create `packages/ai-engine/src/agents/research.ts`:**

```typescript
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
```

**3.2 Create `packages/ai-engine/src/agents/index.ts`:**

```typescript
export * from './research.js';
```

**3.3 Create `packages/ai-engine/src/index.ts`:**

```typescript
export * from './tools/index.js';
export * from './agents/index.js';
```

---

### Step 4: Create Agent API Routes

**4.1 Create `apps/api/src/routes/agents.ts`:**

```typescript
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

    return c.json(
      createResponse({
        tool: toolName,
        args,
        result,
      }),
    );
  } catch (error) {
    console.error('Tool execution error:', error);
    return c.json(createErrorResponse('Tool execution failed'), 500);
  }
});
```

**4.2 Update `apps/api/src/index.ts`:**

```typescript
import { agentsRoutes } from './routes/agents.js';

// Add to routes
app.route('/agents', agentsRoutes);
```

---

## Demo Checklist

- [ ] List available tools
- [ ] Execute individual tools
- [ ] Run research agent with query
- [ ] Agent uses tools appropriately
- [ ] Stream agent execution
- [ ] View agent reasoning steps

---

## API Testing

```bash
# List tools
curl http://localhost:3001/agents/tools

# Execute calculator tool
curl -X POST http://localhost:3001/agents/tool/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "calculator", "args": {"expression": "100 * 1.15"}}'

# Run research agent
curl -X POST http://localhost:3001/agents/research \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the main competitors of Tesla?"}'

# Stream research agent
curl -X POST http://localhost:3001/agents/research/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Analyze the EV market trends"}'
```

---

## What's Next

**Phase 9: Agent Workflows** will add:

- LangGraph state machines
- Cyclic workflows (Plan → Act → Reflect)
- Reflection pattern
- Multi-step reasoning
