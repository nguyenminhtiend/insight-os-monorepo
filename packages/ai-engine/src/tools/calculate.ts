import { tool } from 'ai';
import { z } from 'zod';

/**
 * Calculator tool for numerical operations
 */
export const calculatorTool = tool({
  description: 'Perform mathematical calculations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate (e.g., "100 * 1.05")'),
  }),
  execute: async ({ expression }) => {
    console.log(`[Tool] Calculate: ${expression}`);

    try {
      // Safe evaluation (basic operations only)
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();

      return {
        expression,
        result,
        success: true,
      };
    } catch (error) {
      return {
        expression,
        error: 'Invalid expression',
        success: false,
      };
    }
  },
});

/**
 * Percentage change calculator
 */
export const percentageChangeTool = tool({
  description: 'Calculate percentage change between two values',
  parameters: z.object({
    oldValue: z.number().describe('The original value'),
    newValue: z.number().describe('The new value'),
  }),
  execute: async ({ oldValue, newValue }) => {
    const change = ((newValue - oldValue) / oldValue) * 100;

    return {
      oldValue,
      newValue,
      change: change.toFixed(2) + '%',
      direction: change >= 0 ? 'increase' : 'decrease',
    };
  },
});



