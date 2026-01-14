import { generateText, tool } from 'ai';
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
  conversationId?: string; // DB conversation ID for linking tickets
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
 * Note: createTicket tool will receive conversationId from context.data
 */
function getAgentTools(agentRole: string, context: SupportContext): Record<string, any> {
  // Store conversationId in context.data for tools to access
  if (context.conversationId) {
    context.data.conversationId = context.conversationId;
  }

  const toolMap: Record<string, Record<string, any>> = {
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
  // Build FULL conversation history (not filtered by agent)
  // This ensures agents see the complete context across handoffs
  const conversationHistory = context.messages
    .slice(-20) // Last 20 messages for context window management
    .map((m) => `${m.role === 'user' ? 'Customer' : m.agent}: ${m.content}`)
    .join('\n');

  // Build customer context
  const customerContext = `
Customer Information:
- ID: ${context.customer.id}
- Plan: ${context.customer.plan || 'unknown'}
- Account Age: ${context.customer.accountAge || 0} days
- Email: ${context.customer.email || 'not provided'}

${
  context.pastTickets && context.pastTickets.length > 0
    ? `Recent Tickets:\n${context.pastTickets
        .map((t) => `- ${t.category}: ${t.subject} (${t.resolution || 'unresolved'})`)
        .join('\n')}`
    : ''
}
`.trim();

  // Enhanced system prompt with FULL context
  const systemPrompt = `${agent.systemPrompt}

${customerContext}

IMPORTANT: You have access to the full conversation history above. Use it to maintain context across the conversation.`;

  const tools = getAgentTools(context.currentAgent, context);

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt,
    prompt: conversationHistory ? `${conversationHistory}\n\nCustomer: ${input}` : input,
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
  // Parse memory context to extract previous messages
  const previousMessages: SupportMessage[] = [];

  if (options.context) {
    // Extract messages from context string
    // Context format: "Recent conversation:\nuser: message\nassistant: response\n..."
    const lines = options.context.split('\n');
    let inConversation = false;

    for (const line of lines) {
      if (
        line.startsWith('Recent conversation:') ||
        line.startsWith('Previous conversation history:')
      ) {
        inConversation = true;
        continue;
      }
      if (line.startsWith('Session facts:') || line.startsWith('User preferences:')) {
        inConversation = false;
        continue;
      }

      if (inConversation && line.trim()) {
        // Parse "role: message" format
        const match = line.match(/^(user|assistant|[a-z]+):\s*(.+)$/i);
        if (match) {
          const [, roleOrAgent, content] = match;
          previousMessages.push({
            agent: roleOrAgent === 'user' ? 'user' : roleOrAgent,
            role: roleOrAgent === 'user' ? 'user' : 'assistant',
            content: content.trim(),
            timestamp: new Date()
          });
        }
      }
    }
  }

  const context: SupportContext = {
    messages: [
      ...previousMessages, // Include previous conversation history
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
    history: [],
    conversationId: options.conversationId
  };

  const agentsUsed = new Set<string>();
  let steps = 0;
  let category: string | undefined;
  let requiresHuman = false;

  // Keep original query for context
  const originalQuery = query;

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

      // Use handoff context for next agent, but preserve original query in messages
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
    context?: string;
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
  // Parse previous messages from context (same logic as runSupportSwarm)
  const previousMessages: SupportMessage[] = [];

  if (options.context) {
    const lines = options.context.split('\n');
    let inConversation = false;

    for (const line of lines) {
      if (
        line.startsWith('Recent conversation:') ||
        line.startsWith('Previous conversation history:')
      ) {
        inConversation = true;
        continue;
      }
      if (line.startsWith('Session facts:') || line.startsWith('User preferences:')) {
        inConversation = false;
        continue;
      }

      if (inConversation && line.trim()) {
        const match = line.match(/^(user|assistant|[a-z]+):\s*(.+)$/i);
        if (match) {
          const [, roleOrAgent, content] = match;
          previousMessages.push({
            agent: roleOrAgent === 'user' ? 'user' : roleOrAgent,
            role: roleOrAgent === 'user' ? 'user' : 'assistant',
            content: content.trim(),
            timestamp: new Date()
          });
        }
      }
    }
  }

  const context: SupportContext = {
    messages: [
      ...previousMessages, // Include previous conversation history
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
