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

Available specialists (use exact names):
- "researcher": For gathering information, searching, fact-checking
- "analyst": For data analysis, comparisons, insights
- "writer": For creating reports, summaries, presentations

IMPORTANT: Use the handoff tool with the EXACT agent name (researcher, analyst, or writer).
Route to the most appropriate specialist.`,
    tools: {},
    canHandoff: ['researcher', 'analyst', 'writer']
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

When done, use handoff tool with exact names: "analyst", "writer", or "triage".`,
    tools: {},
    canHandoff: ['analyst', 'writer', 'triage']
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

When done, use handoff tool with exact names: "writer" or "triage".`,
    tools: {},
    canHandoff: ['writer', 'triage']
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

You produce the FINAL OUTPUT. Do NOT use handoff tool - you are the last agent.`,
    tools: {},
    canHandoff: ['triage']
  }
};

// Handoff tool
export const handoffTool = tool({
  description: 'Hand off to another agent',
  parameters: z.object({
    targetAgent: z.string().describe('Name of agent to hand off to'),
    context: z.string().describe('Context and instructions for the next agent'),
    data: z.record(z.unknown()).optional().describe('Data to pass')
  }),
  execute: async ({ targetAgent, context, data }) => {
    return { handoff: true, targetAgent, context, data };
  }
});
