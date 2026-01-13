# Message & Ticket Persistence Implementation

## Summary

Implemented full persistence and user isolation for messages, conversations, and tickets in the support system. All database operations use a shared `db` instance from `@insight-os/db-schema` package to avoid duplication.

## Changes Made

### 1. Database Schema Updates

**Updated: `packages/db-schema/src/schema.ts`**

- Added `userId` column to `conversations` table (indexed)
- User isolation at database level - no longer in metadata JSONB

**New: `packages/db-schema/src/db.ts`**

- Centralized database connection singleton
- Exports shared `db` instance and `pgClient`
- All packages now import from `@insight-os/db-schema`

**Migration: `0004_ancient_maggott.sql`**

```sql
ALTER TABLE "conversations" ADD COLUMN "user_id" text NOT NULL;
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");
```

### 2. Message Persistence (✅ Completed)

**New File: `packages/memory/src/persistence.ts`**

- Created `PersistenceManager` class for DB operations
- Saves messages to PostgreSQL `messages` table
- Links messages to conversations with user isolation
- Loads conversation history from DB (survives beyond Redis 1hr TTL)

**Updated: `packages/memory/src/index.ts`**

- Added `persistence` property to `MemoryManager`
- `addMessage()` now saves to: Buffer → Redis → DB (all 3 tiers)
- `getContext()` now includes DB-persisted message history
- Added `getConversationId()` to get DB conversation UUID
- Added `getUserConversations()` static method

**Message Storage Tiers:**

```
Buffer (in-memory)  → Last 10 messages, per-request only
Redis (session)     → Last 50 messages, 1hr TTL
PostgreSQL (DB)     → All messages, permanent
```

### 2. Ticket Persistence (✅ Completed)

**Updated: `packages/ai-engine/src/support/tools.ts`**

- Implemented real DB insert in `createTicket` tool (was TODO/mock)
- Saves to `tickets` table with proper foreign keys
- Links tickets to conversations via `conversationId`
- Returns actual ticket UUID instead of mock ID

**Updated: `packages/ai-engine/src/support/orchestrator.ts`**

- Added `conversationId` field to `SupportContext` interface
- Passes DB conversation ID through to tools
- Tools can now link tickets to conversation

**Updated: `apps/api/src/routes/support.ts`**

- Gets DB conversation ID via `memory.getConversationId()`
- Passes to `runSupportSwarm()` for ticket creation
- Both streaming and non-streaming endpoints updated

### 3. User Isolation (✅ Completed)

**Enforced at Multiple Levels:**

#### Database Level:

- Conversations: **`user_id` column (indexed)** - proper relational model
- Messages: Linked to user's conversations only via foreign key
- Tickets: Foreign key to `customerId`

#### Query Level:

- `PersistenceManager.getOrCreateConversation()`:

  ```sql
  WHERE conversations.user_id = ${userId}
    AND metadata->>'externalId' = ${conversationId}
  ```

- `PersistenceManager.getUserConversations()`:

  ```sql
  WHERE conversations.user_id = ${userId}
  ```

- Ticket queries:
  ```sql
  WHERE tickets.customer_id = ${customerId}
  ```

#### API Level:

- `/support/customers/:id` - Only returns that customer's data
- `/support/tickets?customerId=X` - Filters by customer
- All memory operations scoped to `userId`

### 4. Shared Database Connection (✅ Completed)

**Centralized in `@insight-os/db-schema`:**

- Single source of truth for DB connection
- No duplicate `postgres()` client creation
- Consistent connection pooling (max: 10, idle: 20s, connect: 10s)

**Updated packages to use shared db:**

- ✅ `apps/api/src/db/index.ts` - Re-exports from db-schema
- ✅ `packages/memory/src/persistence.ts` - Imports from db-schema
- ✅ `packages/ai-engine/src/support/tools.ts` - Imports from db-schema

**`POST /support/chat`**

- ✅ Saves messages to DB
- ✅ Loads message history from DB
- ✅ Links tickets to conversation

**`POST /support/chat/stream`**

- ✅ Saves messages to DB
- ✅ Loads message history from DB
- ✅ Captures streaming response for persistence

**`GET /support/customers/:id`**

- ✅ Returns customer data
- ✅ Returns customer's tickets only
- ✅ Returns customer's conversations only

## Data Flow

### Database Connection Flow

```
All packages import from @insight-os/db-schema
  ↓
import { db } from '@insight-os/db-schema'
  ↓
Shared singleton postgres client (max 10 connections)
  ↓
PostgreSQL Database
```

### Message Save Flow

```
User sends message
  ↓
memory.addMessage('user', message)
  ↓
├─ Buffer.addMessage()          [in-memory]
├─ SessionManager.addMessage()  [Redis]
└─ PersistenceManager.saveMessage()  [PostgreSQL]
```

### Context Load Flow

```
memory.getContext()
  ↓
├─ Buffer: Current conversation
├─ Redis: Recent messages (1hr)
├─ DB: Historical messages
└─ DB: User preferences (userMemories)
```

### Ticket Creation Flow

```
AI Agent calls createTicket tool
  ↓
DB INSERT into tickets
  ↓
Links to:
  - customerId (owner)
  - conversationId (context)
  - category, priority, status
```

## User Isolation Guarantees

1. **Conversations**: Direct `userId` column with index
2. **Messages**: Only accessible via user's conversations (FK constraint)
3. **Tickets**: Direct `customerId` foreign key
4. **Queries**: All filtered by userId/customerId using indexed columns

**Schema Benefits:**

- ✅ Indexed `user_id` column for fast lookups
- ✅ Proper relational model (no JSONB parsing)
- ✅ Database-level constraints
- ✅ Query optimizer can use index

**Example Isolation:**

```typescript
// User A's conversation
const memoryA = new MemoryManager('userA', 'conv_123');

// User B CANNOT access userA's conversation
const memoryB = new MemoryManager('userB', 'conv_123');
// ^ Will create NEW conversation for userB, won't see userA's messages
```

## Testing

To verify everything works:

```bash
# 1. Run migration
cd packages/db-schema
pnpm db:push  # or pnpm db:migrate

# 2. Start services
npm run dev

# 3. Create customer
curl -X POST http://localhost:3000/support/customers \
  -H "Content-Type: application/json" \
  -d '{"id": "cust_123", "email": "test@example.com", "name": "Test User"}'

# 3. Send message (creates conversation + messages in DB)
curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "I need help with billing",
    "conversationId": "conv_001"
  }'

# 4. Send follow-up (loads from DB)
curl -X POST http://localhost:3000/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "message": "What about refunds?",
    "conversationId": "conv_001"
  }'

# 5. Get customer data (see conversations)
curl http://localhost:3000/support/customers/cust_123

# 6. Check database
psql -d insight_os -c "SELECT id, user_id, title, status FROM conversations LIMIT 5;"
psql -d insight_os -c "SELECT id, conversation_id, role, LEFT(content, 50) FROM messages LIMIT 10;"
psql -d insight_os -c "SELECT * FROM tickets WHERE customer_id = 'cust_123';"

# Verify index is being used
psql -d insight_os -c "EXPLAIN SELECT * FROM conversations WHERE user_id = 'cust_123';"
```

## Database Schema

### conversations

- `id` (UUID, PK)
- **`userId` (text, NOT NULL, indexed)** ← New!
- `metadata` (JSONB) - now only contains `externalId`, `type`
- `title`, `status`, `createdAt`, `updatedAt`

**Indexes:**

- `conversations_user_id_idx` on `userId` ← New!
- `conversations_status_idx` on `status`
- `conversations_created_at_idx` on `createdAt`

### messages

- `id` (UUID, PK)
- `conversationId` (FK → conversations)
- `role` (user|assistant|system)
- `content` (text)
- `metadata` (JSONB) - includes `userId`, `externalConversationId`
- `createdAt`

### tickets

- `id` (UUID, PK)
- `customerId` (FK → customers)
- `conversationId` (FK → conversations, nullable)
- `subject`, `category`, `priority`, `status`
- `resolution`, `assignedTo`
- `createdAt`, `resolvedAt`

## Benefits

1. **Persistence**: Messages survive beyond Redis TTL
2. **History**: Full conversation history available
3. **Isolation**: Users can only see their own data (enforced at DB level)
4. **Tracking**: Tickets linked to conversations
5. **Scalability**: DB handles long-term storage
6. **Compliance**: Audit trail of all interactions
7. **Performance**: Indexed `user_id` for fast queries
8. **Maintainability**: Single shared DB connection across all packages
9. **Type Safety**: Relational model vs JSONB parsing

## Architecture Improvements

### Before:

```typescript
// Duplicate DB connections in each package
// packages/memory/src/persistence.ts
const client1 = postgres(connectionString);
const db1 = drizzle(client1);

// packages/ai-engine/src/support/tools.ts
const client2 = postgres(connectionString);
const db2 = drizzle(client2);

// apps/api/src/db/index.ts
const client3 = postgres(connectionString);
const db3 = drizzle(client3);
```

### After:

```typescript
// Single shared connection
// packages/db-schema/src/db.ts
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });

// All packages import from one place
import { db } from '@insight-os/db-schema';
```

## Future Enhancements

- Add message search/filtering
- Implement conversation archiving
- Add message encryption at rest
- Track message edit history
- Add soft delete for conversations
- Implement conversation sharing (with permissions)
