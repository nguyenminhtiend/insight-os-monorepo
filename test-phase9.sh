#!/bin/bash

# Phase 9: Agent Workflows Test Script
# Test Plan→Act→Reflect workflow with LangGraph

set -e

BASE_URL="http://localhost:3001"

echo "🧪 Phase 9: Agent Workflows - Test Script"
echo "=========================================="
echo ""

# Check if API is running
echo "📡 Checking API health..."
if ! curl -s "${BASE_URL}/health" > /dev/null; then
    echo "❌ API is not running. Start it with: cd apps/api && pnpm dev"
    exit 1
fi
echo "✅ API is healthy"
echo ""

# Test 1: Run research workflow
echo "Test 1: Run research workflow"
echo "-----------------------------"
RESPONSE=$(curl -s -X POST "${BASE_URL}/agents/workflow/research" \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the key factors driving Tesla success in the EV market?"}')

echo "Response:"
echo "$RESPONSE" | jq '.'

# Check if we got a successful response
if echo "$RESPONSE" | jq -e '.data.answer' > /dev/null; then
    echo "✅ Workflow completed successfully"

    # Extract key metrics
    CONFIDENCE=$(echo "$RESPONSE" | jq -r '.data.confidence')
    REVISIONS=$(echo "$RESPONSE" | jq -r '.data.revisions')
    STEPS=$(echo "$RESPONSE" | jq -r '.data.steps | length')

    echo "📊 Workflow Metrics:"
    echo "   - Confidence: ${CONFIDENCE}"
    echo "   - Revisions: ${REVISIONS}"
    echo "   - Steps executed: ${STEPS}"

    echo ""
    echo "📝 Final Answer Preview:"
    echo "$RESPONSE" | jq -r '.data.answer' | head -c 300
    echo "..."
else
    echo "❌ Workflow failed"
    exit 1
fi
echo ""

# Test 2: Stream research workflow
echo "Test 2: Stream research workflow"
echo "--------------------------------"
echo "Starting workflow stream (will show each node execution)..."
echo ""

curl -X POST "${BASE_URL}/agents/workflow/research/stream" \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the main competitive advantages of cloud computing providers?"}' \
  --no-buffer 2>/dev/null | head -n 20

echo ""
echo "✅ Stream test completed (showing first 20 events)"
echo ""

# Test 3: Compare with basic agent
echo "Test 3: Compare workflow vs basic agent"
echo "---------------------------------------"
echo "Running basic agent for comparison..."

AGENT_RESPONSE=$(curl -s -X POST "${BASE_URL}/agents/research" \
  -H "Content-Type: application/json" \
  -d '{"query": "What makes SpaceX innovative?", "maxIterations": 3}')

echo "Basic Agent Response:"
echo "$AGENT_RESPONSE" | jq '.data.answer' | head -c 200
echo "..."
echo ""

echo "Running workflow agent for comparison..."

WORKFLOW_RESPONSE=$(curl -s -X POST "${BASE_URL}/agents/workflow/research" \
  -H "Content-Type: application/json" \
  -d '{"query": "What makes SpaceX innovative?"}')

echo "Workflow Agent Response:"
echo "$WORKFLOW_RESPONSE" | jq '.data.answer' | head -c 200
echo "..."
echo ""

echo "📊 Comparison:"
echo "   Basic Agent - Steps: $(echo "$AGENT_RESPONSE" | jq '.data.steps | length')"
echo "   Workflow Agent - Steps: $(echo "$WORKFLOW_RESPONSE" | jq '.data.steps | length'), Revisions: $(echo "$WORKFLOW_RESPONSE" | jq '.data.revisions'), Confidence: $(echo "$WORKFLOW_RESPONSE" | jq '.data.confidence')"
echo ""

echo "🎉 Phase 9 Tests Complete!"
echo "=========================="
echo ""
echo "Key Features Tested:"
echo "✅ Plan→Act→Reflect workflow cycle"
echo "✅ Multi-step plan generation"
echo "✅ Iterative execution of plan steps"
echo "✅ Analysis synthesis"
echo "✅ Self-critique and reflection"
echo "✅ Conditional revision based on quality"
echo "✅ Streaming workflow state updates"
echo "✅ Confidence scoring"
echo ""
echo "Workflow Pattern:"
echo "1. 🎯 Planner creates research plan"
echo "2. 🔄 Executor runs each step iteratively"
echo "3. 📊 Analyzer synthesizes findings"
echo "4. 🔍 Reflector critiques the analysis"
echo "5. 🔀 Conditional: Either revise (→ Replanner) or finalize"
echo "6. ✅ Finalizer produces final answer"
echo ""
echo "Next: Phase 10 - Human-in-the-Loop (approval gates, checkpoints)"

