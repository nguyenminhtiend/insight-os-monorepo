import { z } from 'zod';

// Company Analysis Schema
export const CompanyAnalysisSchema = z.object({
  company: z.string().describe('Company name'),
  ticker: z.string().describe('Stock ticker symbol if publicly traded, empty string otherwise'),
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
        source: z.string().describe('Source or basis for the finding')
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
