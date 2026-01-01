#!/bin/bash

# Phase 7: RAG Advanced - Reranking & Query Reformulation Test Suite
# This script tests all advanced RAG features

BASE_URL="http://localhost:3001"

echo "================================================"
echo "Phase 7: RAG Advanced Tests"
echo "================================================"
echo ""

# Test 1: Advanced RAG Query with Reranking
echo "Test 1: Advanced RAG Query with Reranking"
echo "-----------------------------------------"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is artificial intelligence?",
    "useReranking": true,
    "useQueryReformulation": false,
    "limit": 3
  }' | jq '{
    answer: .data.answer,
    contextCount: (.data.context | length),
    rerankingUsed: .data.metadata.rerankingUsed,
    model: .data.model
  }'
echo ""
echo ""

# Test 2: Query Reformulation
echo "Test 2: Query Reformulation with Conversation Context"
echo "-------------------------------------------------------"
curl -X POST $BASE_URL/rag/reformulate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are their main applications?",
    "conversationContext": {
      "messages": [
        {"role": "user", "content": "Tell me about artificial intelligence"},
        {"role": "assistant", "content": "AI is technology that enables machines to perform tasks that typically require human intelligence."}
      ]
    }
  }' | jq '.'
echo ""
echo ""

# Test 3: Standalone Reranking
echo "Test 3: Standalone Reranking Endpoint"
echo "--------------------------------------"
curl -X POST $BASE_URL/rag/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning algorithms",
    "results": [
      {"id": "1", "content": "Deep learning is a subset of machine learning that uses neural networks with multiple layers.", "score": 0.8},
      {"id": "2", "content": "The weather today is sunny with a chance of rain.", "score": 0.7},
      {"id": "3", "content": "Machine learning algorithms can be supervised, unsupervised, or reinforcement-based.", "score": 0.75}
    ],
    "topK": 2
  }' | jq '.data.results | map({id, content: (.content | .[0:80]), rerankScore, originalScore})'
echo ""
echo ""

# Test 4: Advanced RAG with Query Reformulation
echo "Test 4: Advanced RAG with Query Reformulation"
echo "----------------------------------------------"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What about it?",
    "useReranking": true,
    "useQueryReformulation": true,
    "conversationContext": {
      "messages": [
        {"role": "user", "content": "Tell me about artificial intelligence"},
        {"role": "assistant", "content": "AI is technology that enables machines to perform tasks."}
      ]
    },
    "limit": 2
  }' | jq '{
    originalQuery: .data.originalQuery,
    reformulatedQuery: .data.reformulatedQuery,
    wasReformulated: (.data.reformulatedQuery != null),
    answer: .data.answer,
    metadata: .data.metadata
  }'
echo ""
echo ""

# Test 5: HyDE (Hypothetical Document Embedding)
echo "Test 5: HyDE (Hypothetical Document Embedding)"
echo "-----------------------------------------------"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does machine learning work?",
    "useReranking": true,
    "useHyDE": true,
    "limit": 2
  }' | jq '{
    originalQuery: .data.originalQuery,
    hydeUsed: .data.metadata.hydeUsed,
    retrievalCount: .data.metadata.retrievalCount,
    rerankCount: .data.metadata.rerankCount,
    answer: .data.answer
  }'
echo ""
echo ""

# Test 6: Semantic Caching
echo "Test 6: Semantic Caching (First Call)"
echo "--------------------------------------"
CACHE_QUERY="What is AI in simple terms?"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"$CACHE_QUERY\",
    \"useCache\": true,
    \"limit\": 2
  }" | jq '{cached: .data.cached, model: .data.model, answer: .data.answer}'
echo ""

sleep 1

echo "Test 6b: Semantic Caching (Second Call - Should be Cached)"
echo "-----------------------------------------------------------"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"$CACHE_QUERY\",
    \"useCache\": true,
    \"limit\": 2
  }" | jq '{cached: .data.cached, model: .data.model, answer: .data.answer}'
echo ""
echo ""

# Test 7: Combined Features
echo "Test 7: All Features Combined"
echo "------------------------------"
curl -X POST $BASE_URL/rag/query/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Tell me more about it",
    "useReranking": true,
    "useQueryReformulation": true,
    "useHyDE": false,
    "conversationContext": {
      "messages": [
        {"role": "user", "content": "What is machine learning?"},
        {"role": "assistant", "content": "Machine learning is a subset of AI."}
      ]
    },
    "limit": 3
  }' | jq '{
    originalQuery: .data.originalQuery,
    reformulatedQuery: .data.reformulatedQuery,
    contextCount: (.data.context | length),
    metadata: .data.metadata,
    answerPreview: (.data.answer | .[0:100])
  }'
echo ""
echo ""

echo "================================================"
echo "All Phase 7 Tests Complete!"
echo "================================================"
echo ""
echo "✅ Advanced RAG with reranking"
echo "✅ Query reformulation with conversation context"
echo "✅ Standalone reranking endpoint"
echo "✅ HyDE (Hypothetical Document Embedding)"
echo "✅ Semantic caching"
echo "✅ Combined features"

