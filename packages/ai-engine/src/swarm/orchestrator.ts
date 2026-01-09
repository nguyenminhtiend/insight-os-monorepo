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

      // Validate target agent exists
      if (!agents[result.handoff.targetAgent]) {
        console.warn(`[Swarm] Invalid handoff target: ${result.handoff.targetAgent}, completing task`);
        break;
      }

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
      // Validate target agent exists
      if (!agents[result.handoff.targetAgent]) {
        break;
      }

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
