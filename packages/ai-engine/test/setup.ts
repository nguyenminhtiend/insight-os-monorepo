import { vi } from 'vitest';

// Global test setup for ai-engine package

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});
