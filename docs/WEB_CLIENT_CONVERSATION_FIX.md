# Web Client Conversation Persistence Fix

## Problem

The web client was **breaking conversation continuity** by generating a new conversationId on every message:

```typescript
// ❌ BROKEN - Line 112
conversationId: `chat_${customerId}_${Date.now()}`
// Every message got a new timestamp-based ID!
```

### Impact
- First message: `chat_demo_customer_1705123456789`
- Second message: `chat_demo_customer_1705123457123` ← **Different ID!**
- Result: Each message started a **new conversation**, no history maintained

## Solution

### 1. Track conversationId in Component State

```typescript
// NEW: State to persist conversationId across messages
const [conversationId, setConversationId] = useState<string | null>(null);
```

### 2. Use Server-Provided conversationId

```typescript
// First message - no conversationId
body: JSON.stringify({
  customerId,
  message: textToSend,
  // Don't send conversationId - let server generate stable one
})

// Save conversationId from response
if (!conversationId && data.data.conversationId) {
  setConversationId(data.data.conversationId);
  console.log('Started new conversation:', data.data.conversationId);
}

// Subsequent messages - use saved conversationId
body: JSON.stringify({
  customerId,
  message: textToSend,
  ...(conversationId && { conversationId })  // Include if available
})
```

### 3. Added Clear Conversation Feature

```typescript
const clearConversation = () => {
  setMessages([]);
  setConversationId(null);  // Reset conversation ID
  setResult(null);
  console.log('Conversation cleared - starting fresh');
};
```

## How It Works Now

### Conversation Flow

```
User sends first message
    ↓
Client: { customerId, message }  (no conversationId)
    ↓
Server: Generates stable ID → "support_demo_customer_1705123456789"
    ↓
Client: Saves conversationId in state
    ↓
User sends second message
    ↓
Client: { customerId, message, conversationId }  (includes saved ID)
    ↓
Server: Loads history from same conversation
    ↓
✅ Agent sees full conversation context!
```

### Visual Feedback

**Header shows conversation status:**
```
💬 Support Chat
AI-powered customer support • Active conversation
                            ↑ Shows when conversationId exists
```

**Clear Chat button:**
- Appears when messages exist
- Resets conversation to start fresh
- Clears messages and conversationId

## Code Changes

### Added State
```typescript
const [conversationId, setConversationId] = useState<string | null>(null);
```

### Updated sendMessage()
```typescript
// Send conversationId only if it exists
body: JSON.stringify({
  customerId,
  message: textToSend,
  ...(conversationId && { conversationId })
})

// Save conversationId from first response
if (!conversationId && data.data.conversationId) {
  setConversationId(data.data.conversationId);
}
```

### Added Clear Function
```typescript
const clearConversation = () => {
  setMessages([]);
  setConversationId(null);
  setResult(null);
  setAgentStatus('');
};
```

### Updated UI
```typescript
// Show active conversation indicator
{conversationId && (
  <span className="ml-2 text-xs text-blue-600">
    • Active conversation
  </span>
)}

// Show clear button when needed
{messages.length > 0 && (
  <Button onClick={clearConversation}>Clear Chat</Button>
)}
```

## Testing

### Test Multi-Turn Conversation

```bash
# 1. Start web app
cd apps/web && pnpm dev

# 2. Open http://localhost:3000/support/chat

# 3. Send first message
"I need help with billing"

# 4. Check browser console:
# "Started new conversation: support_demo_customer_XXXXX"

# 5. Send follow-up message
"My invoice is wrong"

# 6. Agent response should reference billing from first message ✅
```

### Verify in Database

```sql
-- Should see both messages in same conversation
SELECT
  c.id,
  c.user_id,
  m.role,
  m.content,
  m.created_at
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
WHERE c.user_id = 'demo_customer'
ORDER BY m.created_at DESC
LIMIT 10;
```

## Benefits

✅ **Conversation Persistence** - Multi-turn conversations work correctly
✅ **Context Maintained** - Agent remembers previous messages
✅ **Server-Controlled IDs** - Stable, predictable conversation IDs
✅ **User Control** - Clear chat to start fresh conversation
✅ **Visual Feedback** - Shows when in active conversation
✅ **Proper Cleanup** - Clear function resets all state

## Example Conversation

### Before Fix ❌
```
User: "I need help with billing"
Agent: "I can help with billing issues."

User: "My invoice is wrong"
Agent: "How can I help you today?"  ← Lost context!
```

### After Fix ✅
```
User: "I need help with billing"
Agent: "I can help with billing issues."
[conversationId saved: support_demo_customer_123]

User: "My invoice is wrong"
Agent: "I see you mentioned billing. Let me check your invoice..."  ← Has context!
```

## Client Best Practices

### DO ✅
- Save conversationId from first response
- Include conversationId in subsequent messages
- Clear conversationId when starting new conversation
- Provide UI to clear/restart conversation

### DON'T ❌
- Generate conversationId client-side with timestamps
- Create new ID for every message
- Forget to include conversationId in follow-ups
- Keep conversationId when user wants fresh start

## Related Files

- `/apps/web/app/support/chat/page.tsx` - Web client (fixed)
- `/apps/api/src/routes/support.ts` - API endpoint (returns conversationId)
- `/docs/SUPPORT_CHAT_MESSAGE_FLOW_FIX.md` - Server-side fix details

## Migration for Other Clients

If you have other clients (mobile, CLI, etc.), apply same pattern:

```typescript
// Pseudocode for any client
let savedConversationId = null;

async function sendMessage(message) {
  const payload = {
    customerId,
    message,
    ...(savedConversationId && { conversationId: savedConversationId })
  };

  const response = await api.post('/support/chat', payload);

  // Save conversationId from first response
  if (!savedConversationId) {
    savedConversationId = response.data.conversationId;
  }

  return response;
}

function clearChat() {
  savedConversationId = null;  // Start fresh
  messages = [];
}
```
