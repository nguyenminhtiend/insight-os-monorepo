import { vi } from 'vitest';

/**
 * Mock response for generateText
 */
export const mockGenerateText = vi.fn().mockResolvedValue({
  text: 'Mocked LLM response',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  steps: [],
  finishReason: 'stop',
});

/**
 * Mock response for generateObject
 */
export const mockGenerateObject = vi.fn().mockResolvedValue({
  object: { intent: 'technical', confidence: 0.9 },
  usage: { promptTokens: 80, completionTokens: 30, totalTokens: 110 },
});

/**
 * Mock response for streamText
 */
export const mockStreamText = vi.fn().mockResolvedValue({
  textStream: (async function* () {
    yield 'Mocked ';
    yield 'streaming ';
    yield 'response';
  })(),
  text: Promise.resolve('Mocked streaming response'),
});

/**
 * Mock response for embed
 */
export const mockEmbed = vi.fn().mockResolvedValue({
  embedding: new Array(1536).fill(0).map(() => Math.random()),
  usage: { tokens: 10 },
});

/**
 * Create mock for handoff tool result
 */
export function createHandoffMock(targetAgent: string, context: string) {
  return vi.fn().mockResolvedValue({
    text: `Handing off to ${targetAgent}`,
    steps: [
      {
        toolCalls: [
          {
            toolName: 'handoff',
            args: { targetAgent, context },
          },
        ],
      },
    ],
    finishReason: 'stop',
  });
}

/**
 * Create mock for tool call result
 */
export function createToolCallMock(toolName: string, result: unknown) {
  return vi.fn().mockResolvedValue({
    text: 'Tool executed successfully',
    steps: [
      {
        toolCalls: [
          {
            toolName,
            args: {},
          },
        ],
        toolResults: [
          {
            toolName,
            result,
          },
        ],
      },
    ],
    finishReason: 'stop',
  });
}

/**
 * Setup AI SDK mocks
 * Call this in your test file to mock all AI SDK functions
 */
export function setupAIMocks() {
  vi.mock('ai', async () => {
    const actual = await vi.importActual('ai');
    return {
      ...actual,
      generateText: mockGenerateText,
      generateObject: mockGenerateObject,
      streamText: mockStreamText,
      embed: mockEmbed,
      tool: vi.fn((config) => config), // Pass through tool definitions
    };
  });
}

/**
 * Reset mock implementation to default
 */
export function resetMockImplementation() {
  mockGenerateText.mockResolvedValue({
    text: 'Mocked LLM response',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    steps: [],
    finishReason: 'stop',
  });

  mockGenerateObject.mockResolvedValue({
    object: { intent: 'technical', confidence: 0.9 },
  });
}
