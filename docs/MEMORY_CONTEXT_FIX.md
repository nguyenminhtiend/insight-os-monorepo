# Memory Context Fix

## Problem

Agent loses conversation context during handoffs. Example:
1. User: "I need to reset my password"
2. Triage → handoff to Account agent
3. Account agent: "Please provide your email"
4. User: "here is my email: abc@com"
5. **❌ Account agent doesn't remember the password reset request**

## Root Causes

### 1. Filtered Conversation History
**Before:**
```typescript
const conversationHistory = context.messages
  .filter((m) => m.agent === agent.name || m.role === 'user')
  .slice(-10)
```

**Problem:** Each agent only saw messages from itself + user, losing context from previous agents.

**After:**
```typescript
const conversationHistory = context.messages
  .slice(-20) // Last 20 messages UNFILTERED
  .map((m) => `${m.role === 'user' ? 'Customer' : m.agent}: ${m.content}`)
```

**Fix:** All agents now see the FULL conversation history including other agents' messages.

### 2. Memory Context Not Injected
**Before:**
```typescript
const context: SupportContext = {
  messages: [
    {
      agent: 'user',
      role: 'user',
      content: query, // Only current message
      timestamp: new Date()
    }
  ],
  // ... options.context was ignored
};
```

**Problem:** The `context` string from MemoryManager (containing DB history) was passed but never used.

**After:**
```typescript
// Parse memory context to extract previous messages
const previousMessages: SupportMessage[] = [];

if (options.context) {
  // Extract from "user: message\nassistant: response" format
  const lines = options.context.split('\n');
  // ... parsing logic ...
}

const context: SupportContext = {
  messages: [
    ...previousMessages, // Include ALL previous messages
    {
      agent: 'user',
      role: 'user',
      content: query,
      timestamp: new Date()
    }
  ],
  // ...
};
```

**Fix:** Previous conversation from DB/Redis is now parsed and injected into the message history.

## Changes Made

### File: `packages/ai-engine/src/support/orchestrator.ts`

#### 1. Updated `runSupportAgent()` function

**Changes:**
- Remove agent-specific filtering (line 100: `.filter((m) => m.agent === agent.name || m.role === 'user')`)
- Include ALL messages from conversation history
- Increased context window from 10 to 20 messages
- Better formatting: `Customer:` for user, agent name for assistants
- Updated system prompt to explicitly mention full conversation history

#### 2. Updated `runSupportSwarm()` function

**Changes:**
- Parse `options.context` string to extract previous messages
- Support multiple context formats:
  - "Recent conversation:" (from PostgreSQL - primary source)
  - "Previous conversation history:" (legacy format, from DB)
- Inject parsed messages into `SupportContext.messages` array
- Preserve message roles and agents

#### 3. Removed BufferMemory (Multi-Server Fix)

**Reason:** BufferMemory is per-process in-memory storage that doesn't work with:
- Multiple HTTP requests (new instance per request)
- Load-balanced server instances (state not shared)
- Horizontal scaling (each server has separate memory)

**Solution:** PostgreSQL as single source of truth
- Works across all server instances
- Messages persist between requests
- Supports true multi-server deployments

## How It Works Now

### Flow with Memory:

```
1. User Request → API (any server instance)
   ↓
2. MemoryManager loads:
   - DB: Historical messages (permanent, last 20) ← PRIMARY SOURCE
   - Redis: Session facts cache (1hr, optional)
   ↓
3. memory.getContext() returns formatted string:
   "Recent conversation:
    user: I need to reset password
    triage: I'll help you with that
    user: Thanks for help last time
    assistant: You're welcome!

    Session facts:
    - issue_type: password_reset

    User preferences:
    - preferred_contact: email"
   ↓
4. runSupportSwarm() parses context:
   previousMessages = [
     { role: 'user', agent: 'user', content: 'I need to reset password' },
     { role: 'assistant', agent: 'triage', content: "I'll help you with that" },
     { role: 'user', agent: 'user', content: 'Thanks for help last time' },
     { role: 'assistant', agent: 'assistant', content: "You're welcome!" }
   ]
   ↓
5. Inject into SupportContext.messages
   ↓
6. Each agent sees FULL history (up to 20 messages)
   ↓
7. Agent maintains context across handoffs ✅
```

### Example Conversation (Fixed):

```
User: "I need to reset my password"
  ↓
Triage Agent (sees: full history)
  → Response: "I'll help you with password reset"
  → Handoff: account agent
  ↓
Account Agent (sees: full history including triage's message)
  → Knows context: User wants password reset
  → Response: "Please provide your email"
  ↓
User: "abc@example.com"
  ↓
Account Agent (sees: full history)
  → Remembers: Password reset request + email provided
  → Action: Calls sendPasswordReset tool
  → Response: "Password reset link sent to abc@example.com"
```

## Testing

### Before Fix:
```bash
curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "I need to reset my password",
    "conversationId": "conv_test"
  }'

# Response from account agent: "Sure, I can help. What do you need?"
# (Loses context about password reset)

curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "abc@example.com",
    "conversationId": "conv_test"
  }'

# Response: "I don't understand. How can I help?"
# ❌ Context lost
```

### After Fix:
```bash
curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "I need to reset my password",
    "conversationId": "conv_test"
  }'

# Response: "I'll help with password reset. Please provide email."

curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "abc@example.com",
    "conversationId": "conv_test"
  }'

# Response: "Password reset link sent to abc@example.com"
# ✅ Context maintained
```

## Key Improvements

1. **Full Conversation History**: All agents see complete conversation (20 messages)
2. **Cross-Agent Context**: Agents remember what previous agents said
3. **Persistent Memory**: DB history loaded and injected into conversation
4. **Better Prompting**: System prompt explicitly mentions full conversation access
5. **Scalable**: Can handle multi-turn conversations with multiple handoffs

## Benefits

- ✅ Agents maintain context across handoffs
- ✅ Multi-turn conversations work correctly
- ✅ Users don't have to repeat themselves
- ✅ More natural conversation flow
- ✅ Better customer experience
- ✅ Reduced frustration from context loss

## Memory Layers Now Working Together

| Layer | Storage | Duration | Purpose | Status |
|-------|---------|----------|---------|--------|
| Buffer | ~~In-memory~~ | ~~Per request~~ | ~~Current conversation~~ | ❌ **REMOVED** (doesn't scale) |
| Session | Redis | 1 hour | Session facts cache | ✅ Optional cache |
| DB | PostgreSQL | Permanent | Source of truth | ✅ Primary storage |
| Agent Context | SupportContext | Per conversation | Agent working memory | ✅ Full history |

### Architecture Update (Multi-Server Compatible)

**REMOVED:** BufferMemory - Cannot work in stateless HTTP with load balancing
- Each HTTP request creates new instance
- Memory doesn't persist across requests
- Breaks when traffic goes to different server instances

**CURRENT:** PostgreSQL as primary, Redis as optional cache
- PostgreSQL stores ALL messages permanently
- Redis caches session facts (1hr TTL)
- Works across all server instances
- No in-memory state that breaks horizontal scaling
