import { analystPrompts } from './analyst.js';
import { researchPrompts } from './research.js';

export interface PromptTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  system: string;
  userTemplate?: string; // Template with {{variable}} placeholders
  fewShot?: Array<{ input: string; output: string }>;
  temperature?: number;
  maxTokens?: number;
}

// Prompt registry
export const prompts = {
  analyst: analystPrompts,
  research: researchPrompts,
} as const;

// Get prompt by path (e.g., 'analyst.company')
export function getPrompt(path: string): PromptTemplate | undefined {
  const [category, name] = path.split('.');
  const categoryPrompts = prompts[category as keyof typeof prompts];
  if (!categoryPrompts) return undefined;
  return categoryPrompts[name as keyof typeof categoryPrompts];
}

// Template interpolation
export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

// List all available prompts
export function listPrompts(): Array<{ path: string; name: string; description: string }> {
  const result: Array<{ path: string; name: string; description: string }> = [];

  for (const [category, categoryPrompts] of Object.entries(prompts)) {
    for (const [name, prompt] of Object.entries(categoryPrompts)) {
      result.push({
        path: `${category}.${name}`,
        name: prompt.name,
        description: prompt.description,
      });
    }
  }

  return result;
}

