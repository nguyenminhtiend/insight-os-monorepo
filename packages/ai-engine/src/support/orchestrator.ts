import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { supportAgents, handoffTool, type SupportAgent } from './agents.js';
import { supportTools } from './tools.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SupportMessage {
  agent: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SupportContext {
  messages: SupportMessage[];
  customer: {
    id: string;
    email?: string;
    name?: string;
    plan?: string;
    accountAge?: number;
  };
  pastTickets?: Array<{
    subject: string;
    category: string;
    resolution?: string;
    createdAt: Date;
  }>;
  data: Record<string, unknown>;
  currentAgent: string;
  history: Array<{ agent: string; action: string; timestamp: Date }>;
}

export interface SupportResult {
  response: string;
  agentsUsed: string[];
  category?: string;
  resolved: boolean;
  requiresHuman: boolean;
  ticketId?: string;
  context: SupportContext;
}

/**
 * Get tools for specific agent
 */
function getAgentTools(agentRole: string): Record<string, unknown> {
  const toolMap: Record<string, Record<string, unknown>> = {
    triage: {
      handoff: handoffTool
    },
    technical: {
      ragSearch: supportTools.ragSearch,
      checkFeatureAccess: supportTools.checkFeatureAccess,
      createTicket: supportTools.createTicket,
      handoff: handoffTool
    },
    billing: {
      getBillingHistory: supportTools.getBillingHistory,
      getSubscription: supportTools.getSubscription,
      requestRefund: supportTools.requestRefund,
      handoff: handoffTool
    },
    account: {
      sendPasswordReset: supportTools.sendPasswordReset,
      checkPermissions: supportTools.checkPermissions,
      handoff: handoffTool
    },
    escalation: {
      createUrgentTicket: supportTools.createUrgentTicket,
      notifyHuman: supportTools.notifyHuman,
      offerCompensation: supportTools.offerCompensation
    }
  };

  return toolMap[agentRole] || { handoff: handoffTool };
}

/**
 * Run single agent with tools
 */
async function runSupportAgent(
  agent: SupportAgent,
  input: string,
  context: SupportContext
): Promise<{
  output: string;
  handoff?: { targetAgent: string; context: string; data?: Record<string, unknown> };
}> {
  // Build conversation history
  const conversationHistory = context.messages
    .filter((m) => m.agent === agent.name || m.role === 'user')
    .slice(-10) // Last 10 messages for context
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  // Build customer context
  const customerContext = `
Customer Information:
- ID: ${context.customer.id}
- Plan: ${context.customer.plan || 'unknown'}
- Account Age: ${context.customer.accountAge || 0} days
- Email: ${context.customer.email || 'not provided'}

${context.pastTickets && context.pastTickets.length > 0 ? `Recent Tickets:\n${context.pastTickets.map((t) => `- ${t.category}: ${t.subject} (${t.resolution || 'unresolved'})`).join('\n')}` : ''}
`.trim();

  // Enhanced system prompt with context
  const systemPrompt = `${agent.systemPrompt}

${customerContext}`;

  const tools = getAgentTools(agent.role);

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt,
    prompt: `${conversationHistory}\n\nCurrent request: ${input}`,
    tools,
    maxSteps: 5
  });

  // Check for handoff in tool calls
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
          handoff: handoffResult
        };
      }
    }
  }

  return { output: result.text };
}

/**
 * Run support swarm orchestration
 */
export async function runSupportSwarm(
  query: string,
  options: {
    customer: {
      id: string;
      email?: string;
      name?: string;
      plan?: string;
      accountAge?: number;
    };
    context?: string;
    pastTickets?: Array<{
      subject: string;
      category: string;
      resolution?: string;
      createdAt: Date;
    }>;
    conversationId?: string;
  },
  maxSteps: number = 10
): Promise<SupportResult> {
  const context: SupportContext = {
    messages: [
      {
        agent: 'user',
        role: 'user',
        content: query,
        timestamp: new Date()
      }
    ],
    customer: options.customer,
    pastTickets: options.pastTickets,
    data: {},
    currentAgent: 'triage',
    history: []
  };

  const agentsUsed = new Set<string>();
  let steps = 0;
  let category: string | undefined;
  let requiresHuman = false;

  while (steps < maxSteps) {
    const agent = supportAgents[context.currentAgent];
    if (!agent) {
      console.error(`[Support] Unknown agent: ${context.currentAgent}`);
      break;
    }

    agentsUsed.add(context.currentAgent);
    context.history.push({
      agent: context.currentAgent,
      action: 'processing',
      timestamp: new Date()
    });

    console.log(`[Support] Running ${agent.name}...`);

    const result = await runSupportAgent(agent, query, context);

    context.messages.push({
      agent: agent.name,
      role: 'assistant',
      content: result.output,
      timestamp: new Date()
    });

    if (result.handoff) {
      console.log(`[Support] Handoff: ${agent.name} → ${result.handoff.targetAgent}`);

      // Validate target agent exists
      if (!supportAgents[result.handoff.targetAgent]) {
        console.warn(`[Support] Invalid handoff target: ${result.handoff.targetAgent}`);
        break;
      }

      // Track category
      if (['technical', 'billing', 'account'].includes(result.handoff.targetAgent)) {
        category = result.handoff.targetAgent;
      }

      // Check if escalating to human
      if (result.handoff.targetAgent === 'escalation') {
        requiresHuman = true;
      }

      context.currentAgent = result.handoff.targetAgent;
      context.data = { ...context.data, ...result.handoff.data };
      context.history.push({
        agent: result.handoff.targetAgent,
        action: 'handoff received',
        timestamp: new Date()
      });

      // Update query with handoff context
      query = result.handoff.context;
    } else {
      // No handoff = task complete
      console.log(`[Support] Task complete by ${agent.name}`);
      break;
    }

    steps++;
  }

  // Get final output
  const finalMessage = context.messages.filter((m) => m.role === 'assistant').pop();
  const resolved = !requiresHuman && steps < maxSteps;

  return {
    response: finalMessage?.content || 'Unable to process request',
    agentsUsed: Array.from(agentsUsed),
    category,
    resolved,
    requiresHuman,
    context
  };
}

/**
 * Stream support swarm execution
 */
export async function* streamSupportSwarm(
  query: string,
  options: {
    customer: {
      id: string;
      email?: string;
      name?: string;
      plan?: string;
      accountAge?: number;
    };
    pastTickets?: Array<{
      subject: string;
      category: string;
      resolution?: string;
      createdAt: Date;
    }>;
  },
  maxSteps: number = 10
): AsyncGenerator<{
  type: 'agent_start' | 'agent_output' | 'handoff' | 'escalation' | 'complete';
  agent?: string;
  content?: string;
  data?: unknown;
}> {
  const context: SupportContext = {
    messages: [
      {
        agent: 'user',
        role: 'user',
        content: query,
        timestamp: new Date()
      }
    ],
    customer: options.customer,
    pastTickets: options.pastTickets,
    data: {},
    currentAgent: 'triage',
    history: []
  };

  let steps = 0;

  while (steps < maxSteps) {
    const agent = supportAgents[context.currentAgent];
    if (!agent) break;

    yield { type: 'agent_start', agent: agent.name };

    const result = await runSupportAgent(agent, query, context);

    yield { type: 'agent_output', agent: agent.name, content: result.output };

    context.messages.push({
      agent: agent.name,
      role: 'assistant',
      content: result.output,
      timestamp: new Date()
    });

    if (result.handoff) {
      if (!supportAgents[result.handoff.targetAgent]) break;

      if (result.handoff.targetAgent === 'escalation') {
        yield {
          type: 'escalation',
          content: 'Escalating to human agent...'
        };
      } else {
        yield {
          type: 'handoff',
          agent: result.handoff.targetAgent,
          content: result.handoff.context
        };
      }

      context.currentAgent = result.handoff.targetAgent;
      query = result.handoff.context;
    } else {
      break;
    }

    steps++;
  }

  yield {
    type: 'complete',
    content: context.messages.filter((m) => m.role === 'assistant').pop()?.content
  };
}
