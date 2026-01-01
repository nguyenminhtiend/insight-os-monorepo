# Phase 2: LLM Advanced - Prompts, Router, JSON Mode

> **Goal:** Build production-grade LLM infrastructure with prompt templates, model routing, structured outputs, and function calling.

---

## Prerequisites

- Phase 1 completed (basic chat + streaming)
- Understanding of different model capabilities

---

## Tech Stack Additions

| Tool             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| Zod              | Schema validation for structured outputs |
| `generateObject` | Vercel AI SDK structured generation      |
| Prompt templates | Versioned, reusable prompts              |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   └── api/
│       └── src/
│           ├── lib/
│           │   ├── ai.ts
│           │   ├── prompts/              # NEW: Prompt templates
│           │   │   ├── index.ts
│           │   │   ├── analyst.ts
│           │   │   └── research.ts
│           │   ├── router.ts             # NEW: Model router
│           │   └── schemas.ts            # NEW: Output schemas
│           └── routes/
│               ├── chat.ts
│               └── analyze.ts            # NEW: Structured analysis
│
├── packages/
│   └── shared/
│       └── src/
│           ├── index.ts
│           └── schemas/                  # NEW: Shared schemas
│               └── analysis.ts
```

---

## Implementation Steps

### Step 1: Create Output Schemas

**1.1 Install Zod in shared package:**

```bash
cd packages/shared
pnpm add zod
```

**1.2 Create `packages/shared/src/schemas/analysis.ts`:**

```typescript
import { z } from 'zod';

// Company Analysis Schema
export const CompanyAnalysisSchema = z.object({
  company: z.string().describe('Company name'),
  ticker: z.string().optional().describe('Stock ticker symbol'),
  summary: z.string().describe('Brief company overview'),
  strengths: z.array(z.string()).describe('Key strengths'),
  weaknesses: z.array(z.string()).describe('Key weaknesses'),
  opportunities: z.array(z.string()).describe('Market opportunities'),
  threats: z.array(z.string()).describe('Potential threats'),
  marketPosition: z.enum(['leader', 'challenger', 'follower', 'niche']).describe('Market position'),
  sentiment: z.enum(['bullish', 'neutral', 'bearish']).describe('Overall sentiment'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1')
});

export type CompanyAnalysis = z.infer<typeof CompanyAnalysisSchema>;

// Market Trend Schema
export const MarketTrendSchema = z.object({
  trend: z.string().describe('Trend name'),
  description: z.string().describe('Detailed description'),
  impact: z.enum(['high', 'medium', 'low']).describe('Business impact level'),
  timeframe: z
    .enum(['immediate', 'short-term', 'medium-term', 'long-term'])
    .describe('Expected timeframe'),
  sectors: z.array(z.string()).describe('Affected sectors'),
  keyPlayers: z.array(z.string()).describe('Key companies involved')
});

export type MarketTrend = z.infer<typeof MarketTrendSchema>;

// Research Output Schema
export const ResearchOutputSchema = z.object({
  query: z.string().describe('Original research query'),
  summary: z.string().describe('Executive summary'),
  keyFindings: z
    .array(
      z.object({
        finding: z.string(),
        importance: z.enum(['critical', 'important', 'notable']),
        source: z.string().optional()
      })
    )
    .describe('Key research findings'),
  recommendations: z.array(z.string()).describe('Actionable recommendations'),
  limitations: z.array(z.string()).describe('Research limitations'),
  nextSteps: z.array(z.string()).describe('Suggested follow-up research')
});

export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// Task Classification Schema (for routing)
export const TaskClassificationSchema = z.object({
  taskType: z
    .enum([
      'simple_question',
      'company_analysis',
      'market_research',
      'competitive_analysis',
      'trend_analysis',
      'general_chat'
    ])
    .describe('Type of task'),
  complexity: z.enum(['low', 'medium', 'high']).describe('Task complexity'),
  requiresReasoning: z.boolean().describe('Whether deep reasoning is needed'),
  suggestedModel: z.enum(['fast', 'smart', 'reasoning']).describe('Recommended model'),
  confidence: z.number().min(0).max(1).describe('Classification confidence')
});

export type TaskClassification = z.infer<typeof TaskClassificationSchema>;
```

**1.3 Update `packages/shared/src/index.ts`:**

```typescript
// Re-export schemas
export * from './schemas/analysis.js';

// Existing exports...
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const createResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString()
});

export const createErrorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
  timestamp: new Date().toISOString()
});

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};
```

---

### Step 2: Create Prompt Templates

**2.1 Create `apps/api/src/lib/prompts/index.ts`:**

```typescript
import { analystPrompts } from './analyst.js';
import { researchPrompts } from './research.js';

export interface PromptTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  system: string;
  userTemplate?: string; // Template with {{variable}} placeholders
  fewShot?: Array<{ input: string; output: string }>;
  temperature?: number;
  maxTokens?: number;
}

// Prompt registry
export const prompts = {
  analyst: analystPrompts,
  research: researchPrompts
} as const;

// Get prompt by path (e.g., 'analyst.company')
export function getPrompt(path: string): PromptTemplate | undefined {
  const [category, name] = path.split('.');
  const categoryPrompts = prompts[category as keyof typeof prompts];
  if (!categoryPrompts) return undefined;
  return categoryPrompts[name as keyof typeof categoryPrompts];
}

// Template interpolation
export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

// List all available prompts
export function listPrompts(): Array<{ path: string; name: string; description: string }> {
  const result: Array<{ path: string; name: string; description: string }> = [];

  for (const [category, categoryPrompts] of Object.entries(prompts)) {
    for (const [name, prompt] of Object.entries(categoryPrompts)) {
      result.push({
        path: `${category}.${name}`,
        name: prompt.name,
        description: prompt.description
      });
    }
  }

  return result;
}
```

**2.2 Create `apps/api/src/lib/prompts/analyst.ts`:**

```typescript
import type { PromptTemplate } from './index.js';

export const analystPrompts: Record<string, PromptTemplate> = {
  company: {
    id: 'analyst-company-v1',
    version: '1.0.0',
    name: 'Company Analysis',
    description: 'Deep SWOT analysis of a company',
    system: `You are a senior market analyst at a top-tier investment firm.
Your task is to provide comprehensive company analysis.

Guidelines:
- Be specific and data-driven
- Cite market share, revenue, or growth metrics when relevant
- Consider both quantitative and qualitative factors
- Maintain objectivity - acknowledge both bull and bear cases
- If you don't have specific data, clearly state it's an estimate

Output must be valid JSON matching the provided schema.`,
    userTemplate: `Analyze {{company}} comprehensively.

Consider:
- Business model and revenue streams
- Competitive positioning
- Recent developments and news
- Future outlook

{{additionalContext}}`,
    temperature: 0.3,
    maxTokens: 2000
  },

  competitive: {
    id: 'analyst-competitive-v1',
    version: '1.0.0',
    name: 'Competitive Analysis',
    description: 'Compare companies in a market segment',
    system: `You are a competitive intelligence analyst.
Your task is to compare companies objectively.

Guidelines:
- Use consistent criteria across all companies
- Highlight differentiation factors
- Consider market dynamics and positioning
- Avoid bias toward any single company

Be structured and systematic in your analysis.`,
    userTemplate: `Compare these companies: {{companies}}

Focus areas:
- Market share and positioning
- Product/service differentiation
- Financial strength
- Growth trajectory

{{additionalContext}}`,
    fewShot: [
      {
        input: 'Compare Apple vs Samsung in smartphones',
        output: `{
  "comparison": {
    "companies": ["Apple", "Samsung"],
    "market": "Smartphones",
    "leader": "Apple (premium segment), Samsung (overall volume)",
    "keyDifferences": [
      "Apple: Integrated ecosystem, premium pricing",
      "Samsung: Android flexibility, diverse price points"
    ]
  }
}`
      }
    ],
    temperature: 0.2,
    maxTokens: 3000
  },

  sentiment: {
    id: 'analyst-sentiment-v1',
    version: '1.0.0',
    name: 'Market Sentiment',
    description: 'Analyze sentiment around a topic or company',
    system: `You are a sentiment analysis specialist.
Analyze the overall market sentiment based on available information.

Guidelines:
- Distinguish between short-term noise and fundamental shifts
- Consider multiple stakeholder perspectives
- Rate confidence in your assessment
- Identify key drivers of sentiment`,
    userTemplate: `Analyze market sentiment for: {{subject}}

Consider:
- Recent news and announcements
- Analyst opinions
- Social/community sentiment
- Institutional positioning`,
    temperature: 0.4,
    maxTokens: 1500
  }
};
```

**2.3 Create `apps/api/src/lib/prompts/research.ts`:**

```typescript
import type { PromptTemplate } from './index.js';

export const researchPrompts: Record<string, PromptTemplate> = {
  market: {
    id: 'research-market-v1',
    version: '1.0.0',
    name: 'Market Research',
    description: 'Comprehensive market analysis',
    system: `You are a market research analyst specializing in industry analysis.

Guidelines:
- Provide structured, actionable insights
- Include market size estimates when possible
- Identify key trends and drivers
- Consider regulatory and technological factors
- Acknowledge data limitations

Output should be comprehensive but focused.`,
    userTemplate: `Research the {{market}} market.

Key questions:
- What is the current market size and growth rate?
- Who are the major players?
- What are the key trends shaping the market?
- What are potential disruptions?

{{specificQuestions}}`,
    temperature: 0.3,
    maxTokens: 3000
  },

  trend: {
    id: 'research-trend-v1',
    version: '1.0.0',
    name: 'Trend Analysis',
    description: 'Deep dive into a specific trend',
    system: `You are a trend analyst focused on identifying and explaining market trends.

Guidelines:
- Explain the drivers behind the trend
- Quantify impact where possible
- Identify winners and losers
- Project timeline and evolution
- Consider second-order effects`,
    userTemplate: `Analyze the trend: {{trend}}

Cover:
- What's driving this trend?
- Who benefits? Who is disrupted?
- What's the timeline for mainstream adoption?
- What are the investment implications?`,
    temperature: 0.4,
    maxTokens: 2500
  },

  summary: {
    id: 'research-summary-v1',
    version: '1.0.0',
    name: 'Research Summary',
    description: 'Summarize research into key points',
    system: `You are an expert at synthesizing information into actionable insights.

Guidelines:
- Lead with the most important finding
- Use bullet points for clarity
- Include "so what" implications
- Be concise but complete
- Highlight uncertainties`,
    userTemplate: `Summarize this research:

{{content}}

Provide:
- Executive summary (2-3 sentences)
- Key findings (bullet points)
- Recommendations
- Open questions`,
    temperature: 0.2,
    maxTokens: 1500
  }
};
```

---

### Step 3: Implement Model Router

**3.1 Create `apps/api/src/lib/router.ts`:**

```typescript
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
```

---

### Step 4: Create Structured Analysis Endpoint

**4.1 Install Zod in API:**

```bash
cd apps/api
pnpm add zod
```

**4.2 Create `apps/api/src/routes/analyze.ts`:**

```typescript
import { Hono } from 'hono';
import { generateObject, generateText, streamObject } from 'ai';
import { stream } from 'hono/streaming';
import { openai, MODELS } from '../lib/ai.js';
import { getPrompt, interpolate, listPrompts } from '../lib/prompts/index.js';
import { hybridRoute } from '../lib/router.js';
import {
  createResponse,
  createErrorResponse,
  CompanyAnalysisSchema,
  ResearchOutputSchema,
  type CompanyAnalysis
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
      additionalContext
    });

    const { object, usage } = await generateObject({
      model: openai(MODELS.smart),
      schema: CompanyAnalysisSchema,
      system: prompt.system,
      prompt: userMessage,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens
    });

    return c.json(
      createResponse({
        analysis: object,
        promptUsed: prompt.id,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens
        }
      })
    );
  } catch (error) {
    console.error('Company analysis error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Analysis failed'),
      500
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
      additionalContext
    });

    const result = streamObject({
      model: openai(MODELS.smart),
      schema: CompanyAnalysisSchema,
      system: prompt.system,
      prompt: userMessage,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens
    });

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      for await (const chunk of result.partialObjectStream) {
        await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      await stream.write('data: [DONE]\n\n');
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Stream failed'),
      500
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

    const { object, usage } = await generateObject({
      model: openai(MODELS.smart),
      schema: ResearchOutputSchema,
      system: prompt.system,
      prompt: interpolate(prompt.userTemplate || '', {
        market: query,
        trend: query,
        content: query,
        specificQuestions: ''
      }),
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens
    });

    return c.json(
      createResponse({
        research: object,
        promptUsed: prompt.id,
        usage
      })
    );
  } catch (error) {
    console.error('Research error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Research failed'),
      500
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
      maxTokens: 2000
    });

    return c.json(
      createResponse({
        response: result.text,
        routing: {
          model,
          classification
        },
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens
        }
      })
    );
  } catch (error) {
    console.error('Auto analysis error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Analysis failed'),
      500
    );
  }
});
```

**4.3 Update `apps/api/src/index.ts`:**

```typescript
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { analyzeRoutes } from './routes/analyze.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    credentials: true
  })
);

// Routes
app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);
app.route('/analyze', analyzeRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.2',
    endpoints: {
      health: '/health',
      chat: '/chat',
      chatStream: '/chat/stream',
      analyzeCompany: '/analyze/company',
      analyzeResearch: '/analyze/research',
      analyzeAuto: '/analyze/auto',
      prompts: '/analyze/prompts'
    }
  });
});

const port = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});

export default app;
```

---

## Demo Checklist

- [ ] `/analyze/company` returns structured SWOT analysis
- [ ] `/analyze/company/stream` streams partial JSON objects
- [ ] `/analyze/research` generates structured research output
- [ ] `/analyze/auto` automatically selects the best model
- [ ] `/analyze/prompts` lists all available templates
- [ ] Model router correctly classifies different query types

---

## API Testing

```bash
# Structured company analysis
curl -X POST http://localhost:3001/analyze/company \
  -H "Content-Type: application/json" \
  -d '{"company": "Tesla"}'

# Stream company analysis
curl -X POST http://localhost:3001/analyze/company/stream \
  -H "Content-Type: application/json" \
  -d '{"company": "Apple"}'

# Research query
curl -X POST http://localhost:3001/analyze/research \
  -H "Content-Type: application/json" \
  -d '{"query": "electric vehicle market", "type": "market"}'

# Auto-routed query
curl -X POST http://localhost:3001/analyze/auto \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare Tesla, Rivian, and Lucid motors"}'

# List prompts
curl http://localhost:3001/analyze/prompts
```

---

## What's Next

**Phase 3: Database Foundation** will add:

- PostgreSQL with Drizzle ORM
- Redis for caching
- Basic data persistence
- Connection management
