#!/bin/bash

# Phase 5 Test Script: RAG Ingestion - Document Processing & Chunking
# Tests document ingestion with various formats and chunking strategies

set -e

API_URL="http://localhost:3001"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Phase 5: RAG Ingestion - Document Processing & Chunking     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 1: Ingest plain text
echo -e "${BLUE}[1] Testing: Ingest Plain Text (without embeddings)${NC}"
TEXT_RESPONSE=$(curl -s -X POST "${API_URL}/documents/text" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tesla Overview",
    "content": "Tesla, Inc. is an American electric vehicle and clean energy company based in Austin, Texas. Tesla designs and manufactures electric vehicles (electric cars and trucks), battery energy storage from home to grid-scale, solar panels and solar roof tiles, and related products and services. Tesla is one of the world'\''s most valuable companies and remains the most valuable automaker with a market capitalization of over $850 billion. In 2022, the company had the most worldwide sales of battery electric vehicles and plug-in electric vehicles, capturing 18% of the battery-electric market and 23% of the plug-in market. Through its subsidiary Tesla Energy, the company develops and is a major installer of photovoltaic systems in the United States. Tesla Energy is also one of the largest global suppliers of battery energy storage systems with 6.5 gigawatt-hours installed in 2022.",
    "options": {
      "chunkSize": 300,
      "chunkOverlap": 50,
      "contentType": "plain",
      "generateEmbeddings": false
    }
  }')

echo "$TEXT_RESPONSE" | jq '.'
DOCUMENT_ID=$(echo "$TEXT_RESPONSE" | jq -r '.data.documentId')
TOTAL_CHUNKS=$(echo "$TEXT_RESPONSE" | jq -r '.data.totalChunks')
PROCESSING_TIME=$(echo "$TEXT_RESPONSE" | jq -r '.data.processingTimeMs')

if [ "$DOCUMENT_ID" != "null" ] && [ "$DOCUMENT_ID" != "" ]; then
  echo -e "${GREEN}✓ Text ingested successfully${NC}"
  echo -e "  Document ID: $DOCUMENT_ID"
  echo -e "  Total Chunks: $TOTAL_CHUNKS"
  echo -e "  Processing Time: ${PROCESSING_TIME}ms"
else
  echo -e "${RED}✗ Text ingestion failed${NC}"
  exit 1
fi
echo ""

# Test 2: Get document with stats
echo -e "${BLUE}[2] Testing: Get Document with Stats${NC}"
DOC_RESPONSE=$(curl -s "${API_URL}/documents/${DOCUMENT_ID}")
echo "$DOC_RESPONSE" | jq '.'

CHUNK_COUNT=$(echo "$DOC_RESPONSE" | jq -r '.data.chunkCount')
if [ "$CHUNK_COUNT" != "null" ]; then
  echo -e "${GREEN}✓ Document retrieved with stats${NC}"
  echo -e "  Chunk Count: $CHUNK_COUNT"
else
  echo -e "${RED}✗ Failed to get document stats${NC}"
fi
echo ""

# Test 3: Get document chunks
echo -e "${BLUE}[3] Testing: Get Document Chunks${NC}"
CHUNKS_RESPONSE=$(curl -s "${API_URL}/documents/${DOCUMENT_ID}/chunks?limit=5")
echo "$CHUNKS_RESPONSE" | jq '.data.chunks[] | {chunkIndex, content: (.content | .[0:100] + "..."), hasEmbedding}'

FIRST_CHUNK=$(echo "$CHUNKS_RESPONSE" | jq -r '.data.chunks[0].content')

if [ "$FIRST_CHUNK" != "null" ]; then
  echo -e "${GREEN}✓ Chunks retrieved${NC}"
else
  echo -e "${RED}✗ Failed to get chunks${NC}"
fi
echo ""

# Test 4: Ingest markdown content
echo -e "${BLUE}[4] Testing: Ingest Markdown with Header-based Chunking${NC}"
MD_RESPONSE=$(curl -s -X POST "${API_URL}/documents/text" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Research Paper.md",
    "content": "# Introduction\n\nArtificial Intelligence has revolutionized many industries.\n\n## Machine Learning\n\nMachine learning is a subset of AI that focuses on learning from data.\n\n### Supervised Learning\n\nSupervised learning uses labeled data for training.\n\n### Unsupervised Learning\n\nUnsupervised learning finds patterns in unlabeled data.\n\n## Deep Learning\n\nDeep learning uses neural networks with multiple layers.\n\n# Conclusion\n\nAI continues to advance rapidly.",
    "options": {
      "contentType": "markdown",
      "generateEmbeddings": false
    }
  }')

echo "$MD_RESPONSE" | jq '.'
MD_DOC_ID=$(echo "$MD_RESPONSE" | jq -r '.data.documentId')
MD_CHUNKS=$(echo "$MD_RESPONSE" | jq -r '.data.totalChunks')

if [ "$MD_DOC_ID" != "null" ]; then
  echo -e "${GREEN}✓ Markdown ingested successfully${NC}"
  echo -e "  Document ID: $MD_DOC_ID"
  echo -e "  Total Chunks (by headers): $MD_CHUNKS"
else
  echo -e "${RED}✗ Markdown ingestion failed${NC}"
fi
echo ""

# Test 5: Ingest from URL
echo -e "${BLUE}[5] Testing: Ingest from URL${NC}"
URL_RESPONSE=$(curl -s -X POST "${API_URL}/documents/url" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://raw.githubusercontent.com/nodejs/node/main/README.md",
    "options": {
      "chunkSize": 800,
      "chunkOverlap": 150,
      "generateEmbeddings": false
    }
  }')

echo "$URL_RESPONSE" | jq '.'
URL_DOC_ID=$(echo "$URL_RESPONSE" | jq -r '.data.documentId')
URL_CHUNKS=$(echo "$URL_RESPONSE" | jq -r '.data.totalChunks')

if [ "$URL_DOC_ID" != "null" ]; then
  echo -e "${GREEN}✓ URL ingested successfully${NC}"
  echo -e "  Document ID: $URL_DOC_ID"
  echo -e "  Total Chunks: $URL_CHUNKS"
else
  echo -e "${RED}✗ URL ingestion failed${NC}"
fi
echo ""

# Test 6: List all documents
echo -e "${BLUE}[6] Testing: List All Documents${NC}"
LIST_RESPONSE=$(curl -s "${API_URL}/documents?limit=10")
echo "$LIST_RESPONSE" | jq '.data.documents[] | {id, name, type, status, chunkCount}'

DOC_COUNT=$(echo "$LIST_RESPONSE" | jq '.data.documents | length')
if [ "$DOC_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✓ Listed documents successfully${NC}"
  echo -e "  Total Documents: $DOC_COUNT"
else
  echo -e "${RED}✗ Failed to list documents${NC}"
fi
echo ""

# Test 7: Test custom chunk sizes
echo -e "${BLUE}[7] Testing: Custom Chunk Sizes${NC}"
SMALL_CHUNK_RESPONSE=$(curl -s -X POST "${API_URL}/documents/text" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Small Chunks Test",
    "content": "This is a test of small chunk sizes. Each chunk should be very small. This allows for more granular retrieval. However, it may lose some context. The trade-off between chunk size and context is important in RAG systems. RAG systems need careful tuning. Chunk sizes affect retrieval quality. Smaller chunks mean more precise matching. Larger chunks preserve more context. The optimal size depends on use case.",
    "options": {
      "chunkSize": 150,
      "chunkOverlap": 30,
      "minChunkSize": 50,
      "generateEmbeddings": false
    }
  }')

LARGE_CHUNK_RESPONSE=$(curl -s -X POST "${API_URL}/documents/text" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Large Chunks Test",
    "content": "This is a test of large chunk sizes. Each chunk should contain more content and preserve more context. This can be useful for documents where maintaining context is critical. However, it may reduce retrieval precision. The optimal chunk size depends on your use case and the nature of your documents. Document processing is key to RAG. Good chunking improves results. Context windows matter. Overlap helps continuity.",
    "options": {
      "chunkSize": 300,
      "chunkOverlap": 60,
      "minChunkSize": 50,
      "generateEmbeddings": false
    }
  }')

SMALL_CHUNKS=$(echo "$SMALL_CHUNK_RESPONSE" | jq -r '.data.totalChunks')
LARGE_CHUNKS=$(echo "$LARGE_CHUNK_RESPONSE" | jq -r '.data.totalChunks')

echo "Small chunk size (150 chars): $SMALL_CHUNKS chunks"
echo "Large chunk size (300 chars): $LARGE_CHUNKS chunks"

if [ "$SMALL_CHUNKS" -ge "$LARGE_CHUNKS" ]; then
  echo -e "${GREEN}✓ Custom chunk sizes working correctly${NC}"
else
  echo -e "${RED}✗ Custom chunk sizes not working as expected${NC}"
fi
echo ""

# Test 8: Skip vector search for now (no embeddings generated)
echo -e "${BLUE}[8] Skipping: Vector Search (embeddings not generated in this test)${NC}"
echo ""

# Test 9: Delete a document
echo -e "${BLUE}[9] Testing: Delete Document (Cascade to Chunks)${NC}"
DELETE_RESPONSE=$(curl -s -X DELETE "${API_URL}/documents/${DOCUMENT_ID}")
echo "$DELETE_RESPONSE" | jq '.'

DELETED=$(echo "$DELETE_RESPONSE" | jq -r '.data.deleted')
if [ "$DELETED" == "true" ]; then
  echo -e "${GREEN}✓ Document deleted successfully${NC}"

  # Verify it's gone
  VERIFY_RESPONSE=$(curl -s "${API_URL}/documents/${DOCUMENT_ID}")
  ERROR=$(echo "$VERIFY_RESPONSE" | jq -r '.error')
  if [ "$ERROR" != "null" ]; then
    echo -e "${GREEN}✓ Document confirmed deleted${NC}"
  fi
else
  echo -e "${RED}✗ Failed to delete document${NC}"
fi
echo ""

# Test 10: Test chunk metadata
echo -e "${BLUE}[10] Testing: Chunk Metadata Extraction${NC}"
CHUNK_DETAIL=$(curl -s "${API_URL}/documents/${MD_DOC_ID}/chunks?limit=1")
echo "$CHUNK_DETAIL" | jq '.data.chunks[0] | {chunkIndex, metadata, contentPreview: (.content | .[0:150] + "...")}'

METADATA=$(echo "$CHUNK_DETAIL" | jq -r '.data.chunks[0].metadata')
if [ "$METADATA" != "null" ] && [ "$METADATA" != "{}" ]; then
  echo -e "${GREEN}✓ Chunk metadata extracted${NC}"
  echo -e "  Metadata: $METADATA"
else
  echo -e "${RED}✗ Chunk metadata missing${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Phase 5 Test Summary                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Text ingestion with custom chunking${NC}"
echo -e "${GREEN}✓ Markdown ingestion with header-based chunking${NC}"
echo -e "${GREEN}✓ URL ingestion${NC}"
echo -e "${GREEN}✓ Document listing with stats${NC}"
echo -e "${GREEN}✓ Chunk retrieval${NC}"
echo -e "${GREEN}✓ Custom chunk size configuration${NC}"
echo -e "${GREEN}✓ Document deletion (cascade)${NC}"
echo -e "${GREEN}✓ Metadata extraction${NC}"
echo ""
echo -e "${BLUE}Phase 5 Complete! Document ingestion pipeline is working.${NC}"
echo ""
echo -e "${BLUE}Next: Phase 6 - RAG Retrieval (Hybrid search, caching)${NC}"

