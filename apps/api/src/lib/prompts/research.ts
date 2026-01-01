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
    maxTokens: 3000,
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
    maxTokens: 2500,
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
    maxTokens: 1500,
  },
};

