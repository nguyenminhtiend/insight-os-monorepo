# Phase 15: Multi-Agent Swarm

> **Goal:** Implement multi-agent collaboration with specialized agents, handoffs, and swarm orchestration for complex tasks.

---

## Prerequisites

- Phase 14 completed (GraphRAG)
- Understanding of multi-agent patterns

---

## Swarm Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TRIAGE AGENT                            │
│                (Routes to specialized agents)                │
└──────────────┬────────────────────┬────────────────────────┘
               │                    │
    ┌──────────▼──────────┐  ┌─────▼─────────────┐
    │  RESEARCH SWARM     │  │  ANALYSIS SWARM   │
    │  ┌───────────────┐  │  │  ┌─────────────┐  │
    │  │ Web Researcher│  │  │  │ Data Analyst│  │
    │  │ Doc Researcher│  │  │  │ Visualizer  │  │
    │  │ Fact Checker  │  │  │  └─────────────┘  │
    │  └───────────────┘  │  │                   │
    └─────────────────────┘  └───────────────────┘
               │                    │
               └────────┬───────────┘
                        ▼
              ┌─────────────────┐
              │  WRITER AGENT   │
              │ (Final Output)  │
              └─────────────────┘
```

---

## Implementation Steps

### Step 1: Define Specialized Agents

**1.1 Create `packages/ai-engine/src/swarm/agents.ts`:**

```typescript
import { generateText, generateObject, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Agent definitions
export interface Agent {
  name: string;
  role: string;
  systemPrompt: string;
  tools: Record<string, unknown>;
  canHandoff: string[];
}

export const agents: Record<string, Agent> = {
  triage: {
    name: 'Triage Agent',
    role: 'router',
    systemPrompt: `You are a triage agent that routes requests to specialized agents.
Analyze the user's request and determine which specialist should handle it.

Available specialists:
- researcher: For gathering information, searching, fact-checking
- analyst: For data analysis, comparisons, insights
- writer: For creating reports, summaries, presentations

Route to the most appropriate specialist.`,
    tools: {},
    canHandoff: ['researcher', 'analyst', 'writer'],
  },

  researcher: {
    name: 'Research Agent',
    role: 'researcher',
    systemPrompt: `You are a research specialist. Your job is to gather comprehensive information.

Guidelines:
- Search multiple sources
- Verify facts when possible
- Cite sources
- Flag uncertainties

When done, hand off to analyst or writer.`,
    tools: {},
    canHandoff: ['analyst', 'writer', 'triage'],
  },

  analyst: {
    name: 'Analysis Agent',
    role: 'analyst',
    systemPrompt: `You are a data analyst. Your job is to analyze information and extract insights.

Guidelines:
- Look for patterns and trends
- Provide quantitative analysis when possible
- Compare and contrast
- Draw actionable conclusions

When done, hand off to writer for final report.`,
    tools: {},
    canHandoff: ['writer', 'triage'],
  },

  writer: {
    name: 'Writer Agent',
    role: 'writer',
    systemPrompt: `You are a professional writer. Your job is to create clear, well-structured output.

Guidelines:
- Use clear, concise language
- Structure content logically
- Include executive summary
- Format for readability

You produce the final output.`,
    tools: {},
    canHandoff: ['triage'],
  },
};

// Handoff tool
export const handoffTool = tool({
  description: 'Hand off to another agent',
  parameters: z.object({
    targetAgent: z.string().describe('Name of agent to hand off to'),
    context: z.string().describe('Context and instructions for the next agent'),
    data: z.record(z.unknown()).optional().describe('Data to pass'),
  }),
  execute: async ({ targetAgent, context, data }) => {
    return { handoff: true, targetAgent, context, data };
  },
});
```

**1.2 Create `packages/ai-engine/src/swarm/orchestrator.ts`:**

```typescript
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { agents, handoffTool, type Agent } from './agents.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SwarmMessage {
  agent: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SwarmContext {
  messages: SwarmMessage[];
  data: Record<string, unknown>;
  currentAgent: string;
  history: Array<{ agent: string; action: string }>;
}

export interface SwarmResult {
  finalOutput: string;
  agentsUsed: string[];
  totalSteps: number;
  context: SwarmContext;
}

/**
 * Run agent with potential handoff
 */
async function runAgent(
  agent: Agent,
  input: string,
  context: SwarmContext,
): Promise<{
  output: string;
  handoff?: { targetAgent: string; context: string; data?: Record<string, unknown> };
}> {
  const conversationHistory = context.messages
    .filter((m) => m.agent === agent.name || m.role === 'user')
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: agent.systemPrompt,
    prompt: `${conversationHistory}\n\nCurrent request: ${input}`,
    tools: {
      handoff: handoffTool,
    },
    maxSteps: 3,
  });

  // Check for handoff
  for (const step of result.steps) {
    for (const call of step.toolCalls || []) {
      if (call.toolName === 'handoff') {
        const handoffResult = call.args as {
          targetAgent: string;
          context: string;
          data?: Record<string, unknown>;
        };

        return {
          output: result.text,
          handoff: handoffResult,
        };
      }
    }
  }

  return { output: result.text };
}

/**
 * Run swarm orchestration
 */
export async function runSwarm(query: string, maxSteps: number = 10): Promise<SwarmResult> {
  const context: SwarmContext = {
    messages: [{ agent: 'user', role: 'user', content: query, timestamp: new Date() }],
    data: {},
    currentAgent: 'triage',
    history: [],
  };

  const agentsUsed = new Set<string>();
  let steps = 0;

  while (steps < maxSteps) {
    const agent = agents[context.currentAgent];
    if (!agent) {
      throw new Error(`Unknown agent: ${context.currentAgent}`);
    }

    agentsUsed.add(context.currentAgent);
    context.history.push({ agent: context.currentAgent, action: 'processing' });

    console.log(`[Swarm] Running ${agent.name}...`);

    const result = await runAgent(agent, query, context);

    context.messages.push({
      agent: agent.name,
      role: 'assistant',
      content: result.output,
      timestamp: new Date(),
    });

    if (result.handoff) {
      console.log(`[Swarm] Handoff to ${result.handoff.targetAgent}`);

      context.currentAgent = result.handoff.targetAgent;
      context.data = { ...context.data, ...result.handoff.data };
      context.history.push({ agent: result.handoff.targetAgent, action: 'handoff received' });

      // Update query with handoff context
      query = result.handoff.context;
    } else {
      // No handoff = task complete
      console.log(`[Swarm] Task complete by ${agent.name}`);
      break;
    }

    steps++;
  }

  // Get final output from last agent response
  const finalMessage = context.messages.filter((m) => m.role === 'assistant').pop();

  return {
    finalOutput: finalMessage?.content || 'No output generated',
    agentsUsed: Array.from(agentsUsed),
    totalSteps: steps,
    context,
  };
}

/**
 * Stream swarm execution
 */
export async function* streamSwarm(
  query: string,
  maxSteps: number = 10,
): AsyncGenerator<{
  type: 'agent_start' | 'agent_output' | 'handoff' | 'complete';
  agent?: string;
  content?: string;
  data?: unknown;
}> {
  const context: SwarmContext = {
    messages: [{ agent: 'user', role: 'user', content: query, timestamp: new Date() }],
    data: {},
    currentAgent: 'triage',
    history: [],
  };

  let steps = 0;

  while (steps < maxSteps) {
    const agent = agents[context.currentAgent];
    if (!agent) break;

    yield { type: 'agent_start', agent: agent.name };

    const result = await runAgent(agent, query, context);

    yield { type: 'agent_output', agent: agent.name, content: result.output };

    context.messages.push({
      agent: agent.name,
      role: 'assistant',
      content: result.output,
      timestamp: new Date(),
    });

    if (result.handoff) {
      yield {
        type: 'handoff',
        agent: result.handoff.targetAgent,
        content: result.handoff.context,
      };

      context.currentAgent = result.handoff.targetAgent;
      query = result.handoff.context;
    } else {
      break;
    }

    steps++;
  }

  yield {
    type: 'complete',
    content: context.messages.filter((m) => m.role === 'assistant').pop()?.content,
  };
}
```

**1.3 Create `packages/ai-engine/src/swarm/index.ts`:**

```typescript
export * from './agents.js';
export * from './orchestrator.js';
```

### Step 2: Add Swarm API Routes

**2.1 Update `apps/api/src/routes/agents.ts`:**

```typescript
import { runSwarm, streamSwarm } from '@insight-os/ai-engine/swarm';

/**
 * POST /agents/swarm
 * Run multi-agent swarm
 */
agentsRoutes.post('/swarm', async (c) => {
  try {
    const { query, maxSteps } = await c.req.json<{
      query: string;
      maxSteps?: number;
    }>();

    const result = await runSwarm(query, maxSteps);
    return c.json(createResponse(result));
  } catch (error) {
    console.error('Swarm error:', error);
    return c.json(createErrorResponse('Swarm execution failed'), 500);
  }
});

/**
 * POST /agents/swarm/stream
 * Stream swarm execution
 */
agentsRoutes.post('/swarm/stream', async (c) => {
  try {
    const { query, maxSteps } = await c.req.json<{
      query: string;
      maxSteps?: number;
    }>();

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');

    return stream(c, async (stream) => {
      const generator = streamSwarm(query, maxSteps);

      for await (const event of generator) {
        await stream.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      await stream.write('data: [DONE]\n\n');
    });
  } catch (error) {
    return c.json(createErrorResponse('Stream failed'), 500);
  }
});
```

---

## Demo Checklist

- [ ] Triage routes to correct agent
- [ ] Research agent gathers information
- [ ] Analyst agent processes data
- [ ] Writer agent produces output
- [ ] Handoffs work correctly
- [ ] Stream shows agent transitions

---

## API Testing

```bash
# Run swarm
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{"query": "Create a competitive analysis report for Tesla vs Rivian"}'

# Stream swarm
curl -X POST http://localhost:3001/agents/swarm/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Research and summarize the AI chip market"}'
```

---

## Congratulations! 🎉

You've completed all 16 phases of the InsightOS implementation plan!

### What You've Built:

- ✅ Monorepo with TurboRepo
- ✅ Hono API + Next.js frontend
- ✅ LLM integration with Vercel AI SDK
- ✅ Prompt templates and model routing
- ✅ PostgreSQL + Drizzle ORM
- ✅ Vector search with pgvector
- ✅ Document ingestion pipeline
- ✅ Hybrid RAG retrieval
- ✅ Advanced RAG with reranking
- ✅ LangGraph agents
- ✅ Cyclic workflows with reflection
- ✅ Human-in-the-loop approval
- ✅ Multi-tier memory system
- ✅ Background jobs with BullMQ
- ✅ Observability with Langfuse
- ✅ GraphRAG with Neo4j
- ✅ Multi-agent swarm orchestration

### Next Steps:

1. Add authentication (Auth.js)
2. Build production UI components
3. Deploy to production environment
4. Add automated testing
5. Implement guardrails
6. Add fine-tuning pipeline
