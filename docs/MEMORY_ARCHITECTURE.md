# Memory Architecture - Multi-Server Deployment

## Overview

The memory system is designed for **production-grade, horizontally scalable deployments** with multiple server instances behind a load balancer.

## Architecture Principles

### ✅ What Works in Production
- **PostgreSQL** - Single source of truth, shared across all servers
- **Redis** - Optional cache layer, shared across all servers
- **Stateless HTTP** - Each request is independent

### ❌ What Doesn't Work
- **In-process memory** - Not shared between requests or servers
- **BufferMemory** - Per-instance, lost after request completes
- **Session affinity assumptions** - Load balancers may route to any server

## Current Memory Layers

### 1. PostgreSQL (Primary Storage)

**Purpose:** Source of truth for all conversations and messages

**Characteristics:**
- ✅ Permanent storage
- ✅ Works across all server instances
- ✅ Survives server restarts
- ✅ Supports querying/analytics
- ✅ User isolation enforced at DB level

**Implementation:**
```typescript
// packages/memory/src/persistence.ts
export class PersistenceManager {
  async saveMessage(role, content) {
    // Saves to PostgreSQL conversations + messages tables
    // Linked to userId for isolation
  }

  async loadRecentMessages(limit = 20) {
    // Loads from PostgreSQL
    // Returns last N messages for this conversation
  }
}
```

**Usage:**
- Stores ALL messages permanently
- Loads last 20 messages for LLM context
- Primary source for conversation history

### 2. Redis (Optional Cache)

**Purpose:** Fast cache for ephemeral session data

**Characteristics:**
- ✅ Shared across server instances
- ✅ Fast read/write (sub-ms)
- ⏱️ 1-hour TTL (auto-expires)
- 📝 Session facts only (not full messages)

**Implementation:**
```typescript
// packages/memory/src/session.ts
export class SessionMemoryManager {
  async addMessage(role, content) {
    // Caches in Redis with 1hr TTL
    // Keeps last 50 messages
  }

  async addFact(key, value, source) {
    // Stores session-scoped facts
    // e.g., "issue_type: billing"
  }
}
```

**Usage:**
- Cache session facts (issue type, preferences, etc.)
- Optional - system works if Redis is down
- Refreshes TTL on access

### 3. Long-Term Memory (PostgreSQL)

**Purpose:** User preferences and learned facts

**Characteristics:**
- ✅ Permanent storage
- ✅ Cross-conversation persistence
- 🔍 Vector search enabled
- 👤 User-scoped (not conversation-scoped)

**Implementation:**
```typescript
// packages/memory/src/longterm.ts
export class LongTermMemory {
  async store(key, value, type) {
    // Stores in memories table
    // Type: preference, fact, context
  }

  async getByType(type, limit) {
    // Retrieves user preferences
    // e.g., preferred_language, timezone
  }
}
```

**Usage:**
- Store user preferences across all conversations
- Learn from past interactions
- Personalize responses

## Request Flow

### Multi-Server Scenario

```
┌─────────────┐
│ Load        │
│ Balancer    │
└──────┬──────┘
       │
       ├──────────────┬──────────────┐
       │              │              │
   ┌───▼───┐      ┌───▼───┐      ┌───▼───┐
   │ API   │      │ API   │      │ API   │
   │Server1│      │Server2│      │Server3│
   └───┬───┘      └───┬───┘      └───┬───┘
       │              │              │
       └──────┬───────┴───────┬──────┘
              │               │
        ┌─────▼─────┐   ┌─────▼─────┐
        │PostgreSQL │   │   Redis   │
        │(Shared DB)│   │  (Cache)  │
        └───────────┘   └───────────┘
```

### Request Lifecycle

**Request 1 (Server 1):**
```typescript
// User sends first message
POST /support/chat
{
  customerId: "cust_123",
  message: "I need help with billing",
  conversationId: "conv_abc"
}

// Server 1 processes
const memory = new MemoryManager("cust_123", "conv_abc");
await memory.addMessage("user", "I need help with billing");
// → Saves to PostgreSQL ✓
// → Caches in Redis ✓

const context = await memory.getContext();
// → Loads from PostgreSQL: [] (first message)
// → Returns empty context

// Response sent, Server 1 forgets everything
```

**Request 2 (Server 2 - different server!):**
```typescript
// User sends second message
POST /support/chat
{
  customerId: "cust_123",
  message: "My last invoice was wrong",
  conversationId: "conv_abc"  // Same conversation
}

// Server 2 processes (load balancer routed here)
const memory = new MemoryManager("cust_123", "conv_abc");
await memory.addMessage("user", "My last invoice was wrong");
// → Saves to PostgreSQL ✓

const context = await memory.getContext();
// → Loads from PostgreSQL: Previous message! ✓
// → Returns: "user: I need help with billing\nassistant: ..."

// ✅ Context maintained across servers!
```

### Why This Works

1. **PostgreSQL is shared** - All servers read/write same DB
2. **conversationId links messages** - Same ID retrieves same history
3. **No in-memory state** - Each request loads fresh from DB
4. **Stateless servers** - Any server can handle any request

## MemoryManager API

### Initialization
```typescript
const memory = new MemoryManager(userId, conversationId);
// Creates managers for all storage layers
```

### Adding Messages
```typescript
await memory.addMessage('user', content);
await memory.addMessage('assistant', response);
// Saves to both Redis (cache) and PostgreSQL (permanent)
```

### Getting Context
```typescript
const context = await memory.getContext();
// Returns formatted string with:
// - Recent conversation (last 20 messages from PostgreSQL)
// - Session facts (from Redis, if available)
// - User preferences (from PostgreSQL)
```

### Getting Conversation ID
```typescript
const dbConvId = await memory.getConversationId();
// Returns PostgreSQL conversation ID for linking tickets
```

## Scaling Characteristics

### Horizontal Scaling ✅
- Add more API servers → All share same PostgreSQL/Redis
- No coordination needed
- Linear scaling

### Load Balancing ✅
- Round-robin, least-connections, etc. all work
- No session affinity required
- Any server can handle any request

### High Availability ✅
- PostgreSQL replication for DB redundancy
- Redis Sentinel for cache HA
- API servers are stateless (any can fail)

### Performance
- PostgreSQL query: ~5-10ms (indexed properly)
- Redis cache: <1ms (if used)
- Context loading: ~10-20ms total

## Migration from BufferMemory

### Old (Broken) Approach
```typescript
// ❌ Each request creates new instance with empty buffer
const memory = new MemoryManager(userId, conversationId);
memory.buffer.messages = []; // Always empty!

const context = await memory.getContext();
// Buffer returns nothing (new instance)
// Only DB messages work
```

### New (Fixed) Approach
```typescript
// ✅ No buffer, only shared storage
const memory = new MemoryManager(userId, conversationId);

const context = await memory.getContext();
// Loads from PostgreSQL (works across servers)
// Returns full conversation history
```

## Best Practices

### DO ✅
- Use `conversationId` consistently across requests
- Load context at start of each request
- Save messages immediately after generating
- Rely on PostgreSQL as source of truth
- Use Redis for caching only (not primary storage)

### DON'T ❌
- Store critical state in-memory
- Assume same server handles follow-up requests
- Cache without database backup
- Use BufferMemory in production
- Skip saving messages to reduce latency

## Monitoring

### Key Metrics
- **DB query latency** - Should be <10ms
- **Context size** - Monitor token count
- **Message persistence rate** - Should be 100%
- **Redis hit rate** - Optional, for optimization

### Health Checks
```typescript
// Check PostgreSQL connection
await db.select().from(conversations).limit(1);

// Check Redis connection
await redis.ping();
```

## Debugging

### "Context not persisting"
```typescript
// Verify conversationId is consistent
console.log('ConversationId:', conversationId);

// Check DB messages
const msgs = await memory.persistence.loadRecentMessages(50);
console.log('DB messages:', msgs.length);
```

### "Different servers see different data"
```typescript
// Verify PostgreSQL connection string is same
console.log(process.env.DATABASE_URL);

// Check conversation exists in DB
const conv = await db
  .select()
  .from(conversations)
  .where(eq(conversations.id, conversationId));
```

## Future Enhancements

### Potential Optimizations
1. **Message batching** - Group multiple messages in one DB write
2. **Context caching** - Cache formatted context strings in Redis
3. **Read replicas** - Use PostgreSQL read replicas for context loading
4. **Message compression** - Compress old messages to save space

### Advanced Features
1. **Context summarization** - Summarize very old messages
2. **Semantic search** - Vector search over conversation history
3. **Cross-conversation learning** - Learn patterns across all user conversations
4. **Adaptive context window** - Dynamically adjust based on conversation complexity

## Summary

The memory system is **production-ready for multi-server deployments**:

- ✅ PostgreSQL as single source of truth
- ✅ Redis as optional cache layer
- ✅ No in-memory state (stateless)
- ✅ Works with any load balancing strategy
- ✅ Scales horizontally
- ✅ User isolation enforced
- ✅ Context persists across requests and servers

**BufferMemory has been removed** because it fundamentally doesn't work in stateless HTTP architectures with multiple server instances.
