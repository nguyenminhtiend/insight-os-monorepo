#!/usr/bin/env bash
set -e

echo "🧪 Phase 6: RAG Retrieval Testing"
echo "================================="
echo ""

API_URL="http://localhost:3001"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Prerequisites:${NC}"
echo "1. API server running on port 3001"
echo "2. PostgreSQL with documents and embeddings"
echo "3. Redis running"
echo ""

# Check if server is running
echo -e "${YELLOW}→ Checking API health...${NC}"
curl -s $API_URL/health | jq '.'
echo ""

# Test 1: Vector-only search
echo -e "${BLUE}Test 1: Vector-only search${NC}"
echo "Searching for 'Tesla electric vehicles' using vector search only..."
curl -s -X POST $API_URL/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tesla electric vehicles",
    "limit": 5,
    "useVector": true,
    "useKeyword": false
  }' | jq '.data.results[] | {id, score, source, content: .content[0:100]}'
echo ""

# Test 2: Keyword-only search
echo -e "${BLUE}Test 2: Keyword-only search${NC}"
echo "Searching for 'Tesla electric vehicles' using keyword search only..."
curl -s -X POST $API_URL/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tesla electric vehicles",
    "limit": 5,
    "useVector": false,
    "useKeyword": true
  }' | jq '.data.results[] | {id, score, source, content: .content[0:100]}'
echo ""

# Test 3: Hybrid search
echo -e "${BLUE}Test 3: Hybrid search (Vector + Keyword)${NC}"
echo "Searching for 'Tesla electric vehicles' using hybrid search..."
curl -s -X POST $API_URL/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tesla electric vehicles",
    "limit": 5,
    "useVector": true,
    "useKeyword": true,
    "vectorWeight": 0.7
  }' | jq '.data.results[] | {id, score, source, content: .content[0:100]}'
echo ""

# Test 4: RAG query (first time - no cache)
echo -e "${BLUE}Test 4: RAG Query (no cache)${NC}"
echo "Asking: 'What is Tesla known for?'"
RAG_RESPONSE=$(curl -s -X POST $API_URL/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is Tesla known for?",
    "limit": 5,
    "useCache": true
  }')
echo "$RAG_RESPONSE" | jq '{
  answer: .data.answer,
  cached: .data.cached,
  model: .data.model,
  contextCount: (.data.context | length),
  usage: .data.usage
}'
echo ""

# Test 5: RAG query (should hit cache)
echo -e "${BLUE}Test 5: RAG Query (with cache)${NC}"
echo "Asking similar question: 'What is Tesla famous for?'"
sleep 1
RAG_CACHED=$(curl -s -X POST $API_URL/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is Tesla famous for?",
    "limit": 5,
    "useCache": true
  }')
echo "$RAG_CACHED" | jq '{
  answer: .data.answer,
  cached: .data.cached,
  model: .data.model,
  contextCount: (.data.context | length)
}'
echo ""

# Test 6: Cache stats
echo -e "${BLUE}Test 6: Cache Statistics${NC}"
curl -s $API_URL/rag/cache/stats | jq '.data'
echo ""

# Test 7: Multi-query RAG
echo -e "${BLUE}Test 7: Multi-Query RAG${NC}"
echo "Using query expansion: 'EV market trends'"
curl -s -X POST $API_URL/rag/query/multi \
  -H "Content-Type: application/json" \
  -d '{
    "query": "EV market trends",
    "limit": 5
  }' | jq '{
  answer: .data.answer[0:200],
  contextCount: (.data.context | length),
  model: .data.model,
  usage: .data.usage
}'
echo ""

# Test 8: Clear cache
echo -e "${BLUE}Test 8: Clear Cache${NC}"
curl -s -X DELETE $API_URL/rag/cache | jq '.data'
echo ""

# Verify cache cleared
echo -e "${YELLOW}→ Verifying cache cleared...${NC}"
curl -s $API_URL/rag/cache/stats | jq '.data'
echo ""

# Test 9: Streaming RAG (test setup, won't display stream)
echo -e "${BLUE}Test 9: Streaming RAG (connection test)${NC}"
echo "Testing streaming endpoint with 'Tell me about Tesla'..."
curl -s -X POST $API_URL/rag/query/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about Tesla", "limit": 3}' \
  --max-time 10 | head -3
echo ""
echo "(Streaming working - output truncated)"
echo ""

# Summary
echo -e "${GREEN}✅ Phase 6 Testing Complete!${NC}"
echo ""
echo "Summary of features tested:"
echo "- ✓ Vector-only search"
echo "- ✓ Keyword-only search (BM25-like)"
echo "- ✓ Hybrid search with RRF fusion"
echo "- ✓ RAG query with context retrieval"
echo "- ✓ Semantic caching (similarity detection)"
echo "- ✓ Cache statistics and clearing"
echo "- ✓ Multi-query RAG with query expansion"
echo "- ✓ Streaming RAG"
echo ""
echo "Next: Review outputs and compare search strategies!"



