#!/bin/bash

# Phase 8: Agent API Testing Script

echo "🧪 Phase 8: Testing Agent Routes"
echo "=================================="
echo ""

BASE_URL="http://localhost:3001"

# Test 1: List available tools
echo "📋 Test 1: List Available Tools"
echo "GET $BASE_URL/agents/tools"
curl -s "$BASE_URL/agents/tools" | jq '.data.tools[] | {name, description}' 2>/dev/null || echo "❌ Server not responding"
echo ""
echo ""

# Test 2: Execute calculator tool
echo "🔢 Test 2: Execute Calculator Tool"
echo "POST $BASE_URL/agents/tool/execute"
curl -s -X POST "$BASE_URL/agents/tool/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "calculator", "args": {"expression": "100 * 1.15"}}' | jq '.data' 2>/dev/null || echo "❌ Failed"
echo ""
echo ""

# Test 3: Execute percentage change tool
echo "📊 Test 3: Execute Percentage Change Tool"
echo "POST $BASE_URL/agents/tool/execute"
curl -s -X POST "$BASE_URL/agents/tool/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "percentageChange", "args": {"oldValue": 100, "newValue": 125}}' | jq '.data' 2>/dev/null || echo "❌ Failed"
echo ""
echo ""

# Test 4: Execute web search tool
echo "🔍 Test 4: Execute Web Search Tool"
echo "POST $BASE_URL/agents/tool/execute"
curl -s -X POST "$BASE_URL/agents/tool/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "webSearch", "args": {"query": "Tesla competitors"}}' | jq '.data.result' 2>/dev/null || echo "❌ Failed"
echo ""
echo ""

# Test 5: Run research agent
echo "🤖 Test 5: Run Research Agent"
echo "POST $BASE_URL/agents/research"
curl -s -X POST "$BASE_URL/agents/research" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is 150 * 1.25?", "maxIterations": 3}' | jq '{query: .data.query, answer: .data.answer, iterations: .data.iterations, toolsUsed: .data.toolsUsed}' 2>/dev/null || echo "❌ Failed"
echo ""
echo ""

echo "✅ Phase 8 testing complete!"
echo ""
echo "💡 To test streaming:"
echo "   curl -X POST $BASE_URL/agents/research/stream \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"query\": \"Calculate 200 * 1.5\"}'"
echo ""





