# @insight-os/memory

Production-ready memory management for multi-server AI applications.

## Features

- ✅ **Multi-server compatible** - Works with load balancing
- ✅ **Stateless architecture** - No in-process memory dependencies
- ✅ **PostgreSQL primary storage** - Source of truth for all messages
- ✅ **Redis caching** - Optional fast cache for session data
- ✅ **User isolation** - Enforced at database level
- ✅ **Conversation history** - Persistent across requests and servers

## Architecture

```
MemoryManager
├── persistence (PostgreSQL) - Permanent message storage
├── session (Redis)          - Ephemeral session cache (1hr TTL)
└── longterm (PostgreSQL)    - User preferences & learned facts
```

### Storage Layers

| Layer | Storage | Scope | Purpose |
|-------|---------|-------|---------|
| Persistence | PostgreSQL | Conversation | All messages (source of truth) |
| Session | Redis | Session | Temporary facts, 1hr cache |
| LongTerm | PostgreSQL | User | Preferences, learned facts |

## Quick Start

```typescript
import { MemoryManager } from '@insight-os/memory';

// Create manager (per request)
const memory = new MemoryManager(userId, conversationId);

// Add messages
await memory.addMessage('user', 'Hello');
await memory.addMessage('assistant', 'Hi there!');

// Get context for LLM
const context = await memory.getContext();
// Returns:
// "Recent conversation:
//  user: Hello
//  assistant: Hi there!"

// Get DB conversation ID
const dbConvId = await memory.getConversationId();
```

## Usage in HTTP API

```typescript
// POST /chat handler
app.post('/chat', async (req, res) => {
  const { userId, message, conversationId } = req.body;

  // 1. Create memory manager (stateless, new each request)
  const memory = new MemoryManager(userId, conversationId);

  // 2. Add user message
  await memory.addMessage('user', message);

  // 3. Get conversation history (from PostgreSQL)
  const context = await memory.getContext();

  // 4. Pass context to LLM
  const response = await llm.generate({
    prompt: `${context}\n\nUser: ${message}`,
    // ...
  });

  // 5. Save assistant response
  await memory.addMessage('assistant', response);

  res.json({ response });
});
```

## Multi-Server Deployment

Works seamlessly with load balancers and multiple server instances:

```
Request 1 → Server A → PostgreSQL (save)
Request 2 → Server B → PostgreSQL (load context from Request 1) ✅
Request 3 → Server C → PostgreSQL (load full history) ✅
```

No session affinity needed!

## API Reference

### MemoryManager

```typescript
class MemoryManager {
  constructor(userId: string, conversationId: string)

  // Add message to conversation
  async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void>

  // Get formatted context for LLM
  async getContext(): Promise<string>

  // Get database conversation ID
  async getConversationId(): Promise<string>

  // Get all user conversations (static method)
  static async getUserConversations(userId: string, limit?: number): Promise<Conversation[]>
}
```

### Context Format

```typescript
const context = await memory.getContext();

// Example output:
`
Recent conversation:
user: I need help with billing
assistant: I can help you with that. What's the issue?
user: My invoice is wrong

Session facts:
- issue_type: billing
- priority: normal

User preferences:
- preferred_contact: email
- timezone: America/New_York
`
```

## Environment Variables

```bash
# PostgreSQL (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Redis (optional, for session caching)
REDIS_URL=redis://localhost:6379
```

## Best Practices

### ✅ DO

- Use consistent `conversationId` across requests
- Create new `MemoryManager` instance per request
- Load context at start of request processing
- Save messages immediately after generation

### ❌ DON'T

- Store MemoryManager in global variables
- Share instances between requests
- Cache MemoryManager instances
- Assume same server handles follow-up requests

## Migration from BufferMemory

BufferMemory has been **deprecated** and removed from MemoryManager.

**Why:** BufferMemory doesn't work in stateless HTTP architectures:
- Creates new empty buffer on every request
- Not shared between server instances
- Lost after request completes

**Instead:** Use PostgreSQL as primary storage (already works!)

```typescript
// ❌ Old (broken)
const memory = new MemoryManager(userId, conversationId);
memory.buffer.addMessage('user', 'hello'); // Lost after request!

// ✅ New (works)
const memory = new MemoryManager(userId, conversationId);
await memory.addMessage('user', 'hello'); // Saved to PostgreSQL
```

## Performance

Typical request with conversation history:

- Redis session load: ~1ms (cache)
- PostgreSQL message load: ~5-10ms (20 messages)
- **Total context loading: ~10-15ms**

Optimizations:
- Messages indexed by conversationId
- Parallel loading (Promise.all)
- Redis caching for hot data

## Troubleshooting

### "Context not persisting between requests"

Check that you're using the **same conversationId**:
```typescript
// ❌ Bad - generates new ID each time
const convId = `conv_${Date.now()}`;

// ✅ Good - consistent ID from client
const convId = req.body.conversationId || generateUniqueId();
```

### "Different servers see different data"

Verify all servers use same database:
```bash
# Check DATABASE_URL on all servers
echo $DATABASE_URL
```

### "Messages not saving"

Check database connection:
```typescript
import { db, conversations } from '@insight-os/db-schema';

// Test query
const test = await db.select().from(conversations).limit(1);
console.log('DB connected:', test);
```

## Related Packages

- `@insight-os/db-schema` - Database schema and migrations
- `@insight-os/ai-engine` - AI agents and orchestration

## Documentation

- [MEMORY_ARCHITECTURE.md](../../docs/MEMORY_ARCHITECTURE.md) - Comprehensive architecture guide
- [MEMORY_FIX_SUMMARY.md](../../docs/MEMORY_FIX_SUMMARY.md) - Recent improvements

## License

MIT
