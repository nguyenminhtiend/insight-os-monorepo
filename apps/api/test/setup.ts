import { vi } from 'vitest';

// Global test setup for API package

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LANGFUSE_SECRET_KEY = 'test-langfuse-secret';
process.env.LANGFUSE_PUBLIC_KEY = 'test-langfuse-public';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});
