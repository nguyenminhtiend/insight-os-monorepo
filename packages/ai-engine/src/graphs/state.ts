import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Research workflow state
 */
export const ResearchState = Annotation.Root({
  // Input
  query: Annotation<string>(),

  // Messages for conversation tracking
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Planning
  plan: Annotation<string[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  currentStep: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  pastSteps: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Execution
  searchResults: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  analysis: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),

  // Reflection
  critique: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),
  shouldRevise: Annotation<boolean>({
    reducer: (x, y) => y,
    default: () => false,
  }),
  revisionCount: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),

  // Output
  finalAnswer: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),
  confidence: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
});

export type ResearchStateType = typeof ResearchState.State;

/**
 * Analysis workflow state
 */
export const AnalysisState = Annotation.Root({
  query: Annotation<string>(),
  subject: Annotation<string>(),
  analysisType: Annotation<'company' | 'market' | 'trend'>({
    reducer: (x, y) => y,
    default: () => 'company',
  }),

  // Data gathering
  gatheredData: Annotation<Record<string, unknown>[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Analysis stages
  initialAnalysis: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),
  refinedAnalysis: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),

  // Quality control
  qualityScore: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  issues: Annotation<string[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),

  // Final output
  finalReport: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),
});

export type AnalysisStateType = typeof AnalysisState.State;
