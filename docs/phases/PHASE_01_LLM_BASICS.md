# Phase 1: LLM Basics - Chat & Streaming

> **Goal:** Integrate Vercel AI SDK with OpenAI, implement streaming chat endpoint, and build a basic chat UI.

---

## Prerequisites

- Phase 0 completed (monorepo with Hono + Next.js)
- OpenAI API key

---

## Tech Stack Additions

| Tool                     | Purpose                        |
| ------------------------ | ------------------------------ |
| Vercel AI SDK (`ai`)     | LLM abstraction with streaming |
| `@ai-sdk/openai`         | OpenAI provider                |
| SSE (Server-Sent Events) | Real-time streaming to client  |

---

## Directory Structure (Changes)

```
/insight-os-monorepo
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── health.ts
│   │       │   └── chat.ts          # NEW: Chat routes
│   │       ├── lib/
│   │       │   └── ai.ts            # NEW: AI client setup
│   │       └── index.ts             # Updated
│   │
│   └── web/
│       └── app/
│           ├── components/
│           │   └── Chat.tsx         # NEW: Chat component
│           └── routes/
│               └── index.tsx        # Updated
│
├── packages/
│   └── shared/
│       └── src/
│           └── index.ts             # Updated with chat types
│
└── .env.example                     # NEW: Environment template
```

---

## Implementation Steps

### Step 1: Add Environment Configuration

**1.1 Create `.env.example` in root:**

```env
# OpenAI
OPENAI_API_KEY=sk-...

# API
API_PORT=3001
```

**1.2 Create `apps/api/.env`:**

```env
OPENAI_API_KEY=sk-your-key-here
```

---

### Step 2: Update Shared Types

**2.1 Update `packages/shared/src/index.ts`:**

```typescript
// Shared types for InsightOS

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
}

// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Utility functions
export const createResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});

export const createErrorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
  timestamp: new Date().toISOString(),
});

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};
```

---

### Step 3: Set Up AI Client

**3.1 Install dependencies in API:**

```bash
cd apps/api
pnpm add ai @ai-sdk/openai
pnpm add -D dotenv
```

**3.2 Create `apps/api/src/lib/ai.ts`:**

```typescript
import { createOpenAI } from '@ai-sdk/openai';

// Initialize OpenAI provider
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default model configuration
export const DEFAULT_MODEL = 'gpt-4o-mini';

// System prompts
export const SYSTEM_PROMPTS = {
  default: `You are InsightOS, a strategic market intelligence assistant.
You help users analyze markets, companies, and competitive landscapes.
Be concise, data-driven, and actionable in your responses.`,

  analyst: `You are a senior market analyst at InsightOS.
Provide detailed analysis with specific data points and citations where possible.
Structure your responses with clear sections and bullet points.`,
};

// Model options for different use cases
export const MODELS = {
  fast: 'gpt-4o-mini', // Quick responses, lower cost
  smart: 'gpt-4o', // Complex analysis
  reasoning: 'o1-mini', // Deep reasoning tasks
} as const;

export type ModelType = keyof typeof MODELS;
```

**3.3 Update `apps/api/src/index.ts`:**

```typescript
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    credentials: true,
  }),
);

// Routes
app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.1',
    endpoints: {
      health: '/health',
      chat: '/chat',
      chatStream: '/chat/stream',
    },
  });
});

const port = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
```

---

### Step 4: Create Chat Routes

**4.1 Create `apps/api/src/routes/chat.ts`:**

```typescript
import { Hono } from 'hono';
import { streamText, generateText } from 'ai';
import { stream } from 'hono/streaming';
import { openai, DEFAULT_MODEL, SYSTEM_PROMPTS, MODELS, type ModelType } from '../lib/ai.js';
import {
  createResponse,
  createErrorResponse,
  generateId,
  type ChatRequest,
} from '@insight-os/shared';

export const chatRoutes = new Hono();

/**
 * POST /chat
 * Non-streaming chat completion
 */
chatRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<ChatRequest>();
    const { messages, model = DEFAULT_MODEL } = body;

    if (!messages || messages.length === 0) {
      return c.json(createErrorResponse('Messages are required'), 400);
    }

    const result = await generateText({
      model: openai(model),
      system: SYSTEM_PROMPTS.default,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    return c.json(
      createResponse({
        id: generateId(),
        message: {
          id: generateId(),
          role: 'assistant' as const,
          content: result.text,
          createdAt: new Date(),
        },
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
      }),
    );
  } catch (error) {
    console.error('Chat error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Unknown error'),
      500,
    );
  }
});

/**
 * POST /chat/stream
 * Streaming chat completion using SSE
 */
chatRoutes.post('/stream', async (c) => {
  try {
    const body = await c.req.json<ChatRequest>();
    const { messages, model = DEFAULT_MODEL } = body;

    if (!messages || messages.length === 0) {
      return c.json(createErrorResponse('Messages are required'), 400);
    }

    const result = streamText({
      model: openai(model),
      system: SYSTEM_PROMPTS.default,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Return streaming response
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const reader = result.textStream;

      for await (const chunk of reader) {
        await stream.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      await stream.write('data: [DONE]\n\n');
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json(
      createErrorResponse(error instanceof Error ? error.message : 'Unknown error'),
      500,
    );
  }
});

/**
 * GET /chat/models
 * List available models
 */
chatRoutes.get('/models', (c) => {
  return c.json(
    createResponse({
      models: Object.entries(MODELS).map(([key, value]) => ({
        id: key,
        name: value,
        description: getModelDescription(key as ModelType),
      })),
      default: DEFAULT_MODEL,
    }),
  );
});

function getModelDescription(type: ModelType): string {
  switch (type) {
    case 'fast':
      return 'Quick responses, lower cost. Best for simple queries.';
    case 'smart':
      return 'Complex analysis and detailed responses.';
    case 'reasoning':
      return 'Deep reasoning for complex problems.';
  }
}
```

---

### Step 5: Build Chat UI

**5.1 Install required shadcn/ui components:**

```bash
cd apps/web
npx shadcn@latest add card input button badge scroll-area
```

**5.2 Create `apps/web/app/components/Chat.tsx`:**

```tsx
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const API_URL = 'http://localhost:3001';

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add placeholder for assistant message
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + parsed.content } : m,
                  ),
                );
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '❌ Error: Failed to get response. Is the API running?' }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">💬 Chat with InsightOS</CardTitle>
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
          Streaming
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 px-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground mb-4">
                Ask me about markets, companies, or competitive analysis.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('What are the key trends in AI industry for 2025?')}
                >
                  AI trends 2025
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('Compare Tesla vs BYD market position')}
                >
                  Tesla vs BYD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('Explain the SWOT framework')}
                >
                  SWOT framework
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex flex-col gap-1 px-4 py-3 rounded-lg max-w-[85%]',
                  message.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'mr-auto bg-muted',
                )}
              >
                <div className="text-xs opacity-70">
                  {message.role === 'user' ? '👤 You' : '🧠 InsightOS'}
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {message.content || (
                    <span className="italic text-muted-foreground">Thinking...</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <form onSubmit={handleSubmit} className="flex gap-3 p-4 border-t">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about markets, companies, trends..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading} size="icon">
            {isLoading ? '...' : '→'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

**5.2 Update `apps/web/app/routes/index.tsx`:**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Chat } from '../components/Chat';

export default function Home() {
  const [health, setHealth] = useState<{
    status: string;
    version: string;
    uptime: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then((data) => setHealth(data.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 border-b">
        <h1 className="text-2xl font-bold">🧠 InsightOS</h1>
        <div className="text-sm">
          {error ? (
            <Badge variant="destructive">● Offline</Badge>
          ) : health ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              ● Online
            </Badge>
          ) : (
            <Badge variant="outline">● Connecting...</Badge>
          )}
        </div>
      </header>

      <main className="flex-1 p-8 max-w-4xl w-full mx-auto">
        <Chat />
      </main>

      <footer className="text-center py-4 border-t">
        <p className="text-sm text-green-600 dark:text-green-400">
          Phase 1: LLM Basics ✓ | Streaming Chat
        </p>
      </footer>
    </div>
  );
}
```

---

## Demo Checklist

- [ ] Non-streaming `/chat` endpoint works
- [ ] Streaming `/chat/stream` endpoint streams tokens
- [ ] Chat UI displays messages
- [ ] Real-time streaming updates in UI
- [ ] Suggestion buttons populate input
- [ ] Error handling when API is down

---

## API Testing

```bash
# Test non-streaming
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'

# Test streaming
curl -X POST http://localhost:3001/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Tell me about AI"}]}'

# List models
curl http://localhost:3001/chat/models
```

---

## What's Next

**Phase 2: LLM Advanced** will add:

- Prompt templates with versioning
- Model router (auto-select model by task)
- JSON mode & structured outputs
- Function calling basics
