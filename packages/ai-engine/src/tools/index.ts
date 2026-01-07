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





