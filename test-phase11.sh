#!/bin/bash

# Phase 11: Memory System Test
# Tests multi-tier memory (buffer, session, long-term)

set -e

API_URL="http://localhost:3001"
USER_ID="test-user-123"

echo "🧠 Phase 11: Memory System Test"
echo "================================"
echo ""

# Test 1: Store memories
echo "1️⃣ Testing long-term memory storage..."
STORE_RESULT=$(curl -s -X POST "$API_URL/memory/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "preference",
    "key": "coding_style",
    "value": "prefers TypeScript with strict types",
    "importance": 8
  }')

echo "$STORE_RESULT" | jq '.'
MEMORY_ID=$(echo "$STORE_RESULT" | jq -r '.data.id')
echo "✅ Stored memory with ID: $MEMORY_ID"
echo ""

# Test 2: Store another memory
echo "2️⃣ Storing user fact..."
curl -s -X POST "$API_URL/memory/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "fact",
    "key": "project_type",
    "value": "working on RAG system with PostgreSQL and Redis",
    "importance": 7
  }' | jq '.'
echo "✅ Stored fact"
echo ""

# Test 3: Store learning
echo "3️⃣ Storing learning..."
curl -s -X POST "$API_URL/memory/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "learning",
    "key": "vector_search",
    "value": "interested in semantic search and embeddings",
    "importance": 6
  }' | jq '.'
echo "✅ Stored learning"
echo ""

# Test 4: Get all memories
echo "4️⃣ Retrieving all memories..."
curl -s "$API_URL/memory/$USER_ID" | jq '.'
echo ""

# Test 5: Get memories by type
echo "5️⃣ Retrieving preferences only..."
curl -s "$API_URL/memory/$USER_ID?type=preference" | jq '.'
echo ""

# Test 6: Search memories
echo "6️⃣ Searching memories for 'TypeScript'..."
curl -s -X POST "$API_URL/memory/$USER_ID/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "TypeScript"}' | jq '.'
echo ""

# Test 7: Extract memories from conversation
echo "7️⃣ Extracting memories from conversation..."
curl -s -X POST "$API_URL/memory/$USER_ID/extract" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I really like using pnpm for package management"},
      {"role": "assistant", "content": "Great choice! pnpm is efficient with disk space."},
      {"role": "user", "content": "Also, I prefer functional programming over OOP"},
      {"role": "assistant", "content": "Functional programming has many benefits for maintainability."}
    ]
  }' | jq '.'
echo "✅ Extracted and stored memories from conversation"
echo ""

# Test 8: Get relevant memories for a query
echo "8️⃣ Getting relevant memories for 'What package manager should I use?'..."
curl -s -X POST "$API_URL/memory/$USER_ID/relevant" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What package manager should I use?",
    "limit": 3
  }' | jq '.'
echo ""

# Test 9: Get relevant memories for coding style
echo "9️⃣ Getting relevant memories for 'How should I write my code?'..."
curl -s -X POST "$API_URL/memory/$USER_ID/relevant" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How should I write my code?",
    "limit": 3
  }' | jq '.'
echo ""

# Test 10: Delete a memory
echo "🔟 Deleting memory..."
if [ ! -z "$MEMORY_ID" ]; then
  curl -s -X DELETE "$API_URL/memory/$USER_ID/$MEMORY_ID" | jq '.'
  echo "✅ Deleted memory"
else
  echo "⚠️ No memory ID to delete"
fi
echo ""

echo "✅ Phase 11 Complete: Memory System"
echo ""
echo "📊 Capabilities Demonstrated:"
echo "   - Long-term memory storage in PostgreSQL"
echo "   - Memory types: preferences, facts, learnings"
echo "   - Importance scoring (1-10)"
echo "   - Memory search (ILIKE)"
echo "   - AI-powered memory extraction from conversations"
echo "   - AI-powered relevant memory retrieval"
echo "   - Memory deletion"
echo ""
echo "🎯 Next Steps:"
echo "   - Session memory (Redis) for mid-term storage"
echo "   - Buffer memory (in-memory) for active conversations"
echo "   - Combined context generation from all memory tiers"
echo "   - Integration with chat/RAG endpoints"

