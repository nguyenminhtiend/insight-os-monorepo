#!/bin/bash

# Phase 13: Observability Testing Script
# Tests Langfuse integration, tracing, and metrics

set -e

BASE_URL="http://localhost:3001"
LANGFUSE_URL="https://cloud.langfuse.com"

echo "🧪 Phase 13: Observability - Langfuse Tracing Tests"
echo "=================================================="
echo ""

echo ""
echo "1️⃣  Testing Metrics Endpoint"
echo "----------------------------"
METRICS=$(curl -s "$BASE_URL/metrics")
echo "Metrics response:"
echo "$METRICS" | jq '.'

echo ""
echo "2️⃣  Testing Chat Endpoint with Tracing"
echo "--------------------------------------"
CHAT_RESPONSE=$(curl -s -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! Test trace message",
    "conversationId": "test-trace-123"
  }')

echo "Chat response:"
echo "$CHAT_RESPONSE" | jq '.'

echo ""
echo "3️⃣  Testing RAG Query with Tracing"
echo "----------------------------------"
RAG_RESPONSE=$(curl -s -X POST "$BASE_URL/rag/query" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is market analysis?",
    "topK": 3
  }')

echo "RAG response:"
echo "$RAG_RESPONSE" | jq '.success'

echo ""
echo "4️⃣  Testing Analyze Endpoint with Tracing"
echo "-----------------------------------------"
ANALYZE_RESPONSE=$(curl -s -X POST "$BASE_URL/analyze/company" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "OpenAI",
    "analysisType": "overview"
  }')

echo "Analyze response:"
echo "$ANALYZE_RESPONSE" | jq '.success'

echo ""
echo "5️⃣  Checking Updated Metrics"
echo "----------------------------"
sleep 2  # Wait for traces to be recorded
METRICS_AFTER=$(curl -s "$BASE_URL/metrics")
echo "Updated metrics:"
echo "$METRICS_AFTER" | jq '.'

echo ""
echo "6️⃣  Testing Error Tracing"
echo "------------------------"
ERROR_RESPONSE=$(curl -s -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}' || echo '{"error": "Request failed as expected"}')

echo "Error response:"
echo "$ERROR_RESPONSE" | jq '.'

echo ""
echo "7️⃣  Final Metrics Check"
echo "----------------------"
FINAL_METRICS=$(curl -s "$BASE_URL/metrics")
echo "Final metrics:"
echo "$FINAL_METRICS" | jq '.'

echo ""
echo "📊 Metrics Summary"
echo "------------------"
echo "Total requests: $(echo "$FINAL_METRICS" | jq '.data.requests')"
echo "LLM calls: $(echo "$FINAL_METRICS" | jq '.data.llmCalls')"
echo "Prompt tokens: $(echo "$FINAL_METRICS" | jq '.data.tokens.prompt')"
echo "Completion tokens: $(echo "$FINAL_METRICS" | jq '.data.tokens.completion')"
echo "Estimated cost: $(echo "$FINAL_METRICS" | jq -r '.data.estimatedCost')"
echo "Errors: $(echo "$FINAL_METRICS" | jq '.data.errors')"
echo "Avg latency: $(echo "$FINAL_METRICS" | jq -r '.data.avgLatencyMs') ms"

echo ""
echo "✅ Phase 13 Tests Complete!"
echo ""
echo "🔍 Next Steps:"
echo "1. Visit Langfuse dashboard: $LANGFUSE_URL"
echo "2. Check for traces from your API"
echo "3. Review LLM call metrics and costs"
echo "4. Explore trace details and performance"
echo ""
echo "📝 Note: Traces may take a few seconds to appear in Langfuse"
