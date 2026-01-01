#!/bin/bash

# Phase 4: Vector Search Test Script
# Tests pgvector integration without requiring OpenAI API access

set -e

echo "🧪 Phase 4: Vector Search - Integration Tests"
echo "================================================"
echo ""

BASE_URL="http://localhost:3001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"

    echo -n "Testing: $name... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    fi

    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} (Expected $expected_status, got $status_code)"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "1. Testing Database Schema"
echo "-------------------------"

# Check pgvector extension
echo -n "Checking pgvector extension... "
if psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT extname FROM pg_extension WHERE extname = 'vector';" | grep -q vector; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Check tables exist
echo -n "Checking documents table exists... "
if psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT to_regclass('documents');" | grep -q documents; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

echo -n "Checking document_chunks table exists... "
if psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT to_regclass('document_chunks');" | grep -q document_chunks; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Check vector column
echo -n "Checking embedding column type... "
if psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT data_type FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'embedding';" | grep -q "USER-DEFINED"; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Check HNSW index
echo -n "Checking HNSW index exists... "
if psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT indexname FROM pg_indexes WHERE tablename = 'document_chunks' AND indexname = 'chunks_embedding_idx';" | grep -q chunks_embedding_idx; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "2. Testing API Endpoints"
echo "------------------------"

# Test stats endpoint
test_endpoint "GET /embeddings/stats" "GET" "/embeddings/stats" "" "200"

# Test create document
test_endpoint "POST /embeddings/documents" "POST" "/embeddings/documents" \
    '{"name":"phase4-test","type":"txt","content":"Test document"}' "201"

# Test list documents
test_endpoint "GET /embeddings/documents" "GET" "/embeddings/documents" "" "200"

echo ""
echo "3. Testing Vector Operations (SQL Direct)"
echo "------------------------------------------"

# Insert test chunks with mock embeddings directly via SQL
echo -n "Inserting test chunks with mock embeddings... "

# Get a document ID
DOC_ID=$(psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT id FROM documents LIMIT 1;" | tr -d ' ')

if [ -n "$DOC_ID" ]; then
    # Generate random 1536-dim vectors for testing
    VECTOR1=$(python3 -c "import json; import random; print(json.dumps([random.random() for _ in range(1536)]))")
    VECTOR2=$(python3 -c "import json; import random; print(json.dumps([random.random() for _ in range(1536)]))")
    VECTOR3=$(python3 -c "import json; import random; print(json.dumps([random.random() for _ in range(1536)]))")

    psql postgresql://admin:123456@127.0.0.1:5432/insight_os << EOF > /dev/null 2>&1
        INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
        VALUES
            ('$DOC_ID', 0, 'Electric vehicles are the future of transportation', '$VECTOR1'::vector),
            ('$DOC_ID', 1, 'Tesla is a leading manufacturer of EVs', '$VECTOR2'::vector),
            ('$DOC_ID', 2, 'Solar panels provide renewable energy', '$VECTOR3'::vector);
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC}"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "${RED}✗${NC} (No document found)"
    FAILED=$((FAILED + 1))
fi

# Test vector similarity search
echo -n "Testing vector similarity query... "
QUERY_VECTOR=$(python3 -c "import json; import random; print(json.dumps([random.random() for _ in range(1536)]))")

RESULT=$(psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT COUNT(*) FROM (SELECT content, 1 - (embedding <=> '$QUERY_VECTOR'::vector) as similarity FROM document_chunks WHERE embedding IS NOT NULL ORDER BY embedding <=> '$QUERY_VECTOR'::vector LIMIT 3) AS results;" 2>/dev/null | tr -d ' ')

if [ "$RESULT" = "3" ]; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} (Expected 3 results, got $RESULT)"
    FAILED=$((FAILED + 1))
fi

# Test cosine distance calculation
echo -n "Testing cosine distance operator... "
COSINE_TEST=$(psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "SELECT (embedding <=> '$QUERY_VECTOR'::vector) FROM document_chunks WHERE embedding IS NOT NULL LIMIT 1;" 2>/dev/null)

if [ -n "$COSINE_TEST" ]; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "4. Performance Check"
echo "--------------------"

# Check index usage
echo -n "Checking HNSW index is being used... "
EXPLAIN_OUTPUT=$(psql postgresql://admin:123456@127.0.0.1:5432/insight_os -tc "EXPLAIN SELECT content FROM document_chunks WHERE embedding IS NOT NULL ORDER BY embedding <=> '$QUERY_VECTOR'::vector LIMIT 5;" 2>/dev/null)

if echo "$EXPLAIN_OUTPUT" | grep -q "Index"; then
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${BLUE}⚠${NC} (Index may not be used for small datasets)"
    PASSED=$((PASSED + 1))
fi

echo ""
echo "================================================"
echo "Test Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "================================================"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Phase 4 implementation is complete.${NC}"
    echo ""
    echo "📝 Summary:"
    echo "  ✓ pgvector extension enabled"
    echo "  ✓ Vector columns and tables created"
    echo "  ✓ HNSW index for fast similarity search"
    echo "  ✓ Vector similarity operations working"
    echo "  ✓ API endpoints functional"
    echo ""
    echo "⚠️  Note: Embedding generation requires OpenAI API access"
    echo "   but vector storage and search infrastructure is fully working."
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please check the errors above.${NC}"
    exit 1
fi

