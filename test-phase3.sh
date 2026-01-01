#!/bin/bash

# Phase 3 Test Script - Database Foundation
# Tests PostgreSQL, Redis, and Conversations API

set -e

API_URL="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🧪 Phase 3: Database Foundation Tests"
echo "======================================"
echo ""

# Check if API is running
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ API not running on $API_URL${NC}"
  echo "   Start API with: cd apps/api && pnpm dev"
  exit 1
fi

echo "1️⃣  Health Check with Services"
echo "------------------------------"
HEALTH=$(curl -s "$API_URL/health")
echo "$HEALTH" | jq '.'
DB_STATUS=$(echo "$HEALTH" | jq -r '.data.services.database')
REDIS_STATUS=$(echo "$HEALTH" | jq -r '.data.services.redis')

if [ "$DB_STATUS" = "connected" ]; then
  echo -e "${GREEN}✅ PostgreSQL connected${NC}"
else
  echo -e "${RED}❌ PostgreSQL not connected${NC}"
  exit 1
fi

if [ "$REDIS_STATUS" = "connected" ]; then
  echo -e "${GREEN}✅ Redis connected${NC}"
else
  echo -e "${RED}❌ Redis not connected${NC}"
  exit 1
fi

echo ""
echo "2️⃣  Create Conversation"
echo "------------------------------"
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/conversations" \
  -H "Content-Type: application/json" \
  -d '{"title": "Tesla Analysis Session", "metadata": {"topic": "tech"}}')

echo "$CREATE_RESPONSE" | jq '.'
CONV_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id')

if [ "$CONV_ID" != "null" ] && [ -n "$CONV_ID" ]; then
  echo -e "${GREEN}✅ Conversation created: $CONV_ID${NC}"
else
  echo -e "${RED}❌ Failed to create conversation${NC}"
  exit 1
fi

echo ""
echo "3️⃣  Add User Message"
echo "------------------------------"
MSG1=$(curl -s -X POST "$API_URL/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Tell me about Tesla"}')

echo "$MSG1" | jq '.'
MSG1_ID=$(echo "$MSG1" | jq -r '.data.id')

if [ "$MSG1_ID" != "null" ]; then
  echo -e "${GREEN}✅ User message added${NC}"
else
  echo -e "${RED}❌ Failed to add message${NC}"
  exit 1
fi

echo ""
echo "4️⃣  Add Assistant Message"
echo "------------------------------"
MSG2=$(curl -s -X POST "$API_URL/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"role": "assistant", "content": "Tesla is an electric vehicle manufacturer...", "metadata": {"model": "gpt-4o-mini", "promptTokens": 20, "completionTokens": 100}}')

echo "$MSG2" | jq '.'
MSG2_ID=$(echo "$MSG2" | jq -r '.data.id')

if [ "$MSG2_ID" != "null" ]; then
  echo -e "${GREEN}✅ Assistant message added${NC}"
else
  echo -e "${RED}❌ Failed to add assistant message${NC}"
  exit 1
fi

echo ""
echo "5️⃣  Get Conversation with Messages"
echo "------------------------------"
GET_CONV=$(curl -s "$API_URL/conversations/$CONV_ID")
echo "$GET_CONV" | jq '.'

MSG_COUNT=$(echo "$GET_CONV" | jq '.data.messages | length')
if [ "$MSG_COUNT" = "2" ]; then
  echo -e "${GREEN}✅ Retrieved conversation with $MSG_COUNT messages${NC}"
else
  echo -e "${RED}❌ Expected 2 messages, got $MSG_COUNT${NC}"
  exit 1
fi

echo ""
echo "6️⃣  Update Conversation"
echo "------------------------------"
UPDATE=$(curl -s -X PATCH "$API_URL/conversations/$CONV_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "Tesla Deep Dive", "metadata": {"topic": "tech", "updated": true}}')

echo "$UPDATE" | jq '.'
NEW_TITLE=$(echo "$UPDATE" | jq -r '.data.title')

if [ "$NEW_TITLE" = "Tesla Deep Dive" ]; then
  echo -e "${GREEN}✅ Conversation updated${NC}"
else
  echo -e "${RED}❌ Failed to update conversation${NC}"
  exit 1
fi

echo ""
echo "7️⃣  List Conversations"
echo "------------------------------"
LIST=$(curl -s "$API_URL/conversations?limit=10&offset=0")
echo "$LIST" | jq '.'

CONV_COUNT=$(echo "$LIST" | jq '.data.conversations | length')
if [ "$CONV_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Listed $CONV_COUNT conversation(s)${NC}"
else
  echo -e "${RED}❌ No conversations found${NC}"
  exit 1
fi

echo ""
echo "8️⃣  Soft Delete Conversation"
echo "------------------------------"
DELETE=$(curl -s -X DELETE "$API_URL/conversations/$CONV_ID")
echo "$DELETE" | jq '.'

DELETED=$(echo "$DELETE" | jq -r '.data.deleted')
if [ "$DELETED" = "true" ]; then
  echo -e "${GREEN}✅ Conversation soft deleted${NC}"
else
  echo -e "${RED}❌ Failed to delete conversation${NC}"
  exit 1
fi

echo ""
echo "9️⃣  Verify Deleted Not in Active List"
echo "------------------------------"
LIST_AFTER=$(curl -s "$API_URL/conversations?limit=10&offset=0")
FOUND=$(echo "$LIST_AFTER" | jq --arg id "$CONV_ID" '.data.conversations[] | select(.id == $id)')

if [ -z "$FOUND" ]; then
  echo -e "${GREEN}✅ Deleted conversation not in active list${NC}"
else
  echo -e "${RED}❌ Deleted conversation still showing${NC}"
  exit 1
fi

echo ""
echo "================================"
echo -e "${GREEN}✅ All Phase 3 Tests Passed!${NC}"
echo "================================"
echo ""
echo "📊 What was tested:"
echo "  ✓ PostgreSQL connection"
echo "  ✓ Redis connection"
echo "  ✓ Create conversation"
echo "  ✓ Add messages (user & assistant)"
echo "  ✓ Retrieve conversation with messages"
echo "  ✓ Update conversation metadata"
echo "  ✓ List conversations with pagination"
echo "  ✓ Soft delete conversation"
echo "  ✓ Verify deleted not in active list"
echo ""
echo "🎉 Database Foundation is complete!"
echo ""
echo "💡 Next steps:"
echo "  - Check Drizzle Studio: cd packages/db-schema && pnpm db:studio"
echo "  - View data in browser at http://localhost:4983"
echo ""

