#!/bin/bash

# Phase 15 Demo: Multi-Agent Swarm

echo "🎯 Phase 15: Multi-Agent Swarm Demo"
echo "===================================="
echo ""
echo "This demo showcases specialized agents collaborating through handoffs:"
echo "  - Triage Agent: Routes requests"
echo "  - Research Agent: Gathers information"
echo "  - Analyst Agent: Analyzes data"
echo "  - Writer Agent: Creates final output"
echo ""

API_URL="http://localhost:3001"

echo "📝 Example 1: Competitive Analysis (Triage → Analyst → Writer)"
echo "================================================================"
echo "Query: Tesla vs Rivian competitive analysis"
echo ""

curl -s -X POST "$API_URL/agents/swarm" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a brief competitive analysis of Tesla vs Rivian",
    "maxSteps": 5
  }' | jq '{
    agentsUsed: .data.agentsUsed,
    totalSteps: .data.totalSteps,
    workflow: [.data.context.history[].agent]
  }'

echo ""
echo ""

echo "🔬 Example 2: Research Task (Triage → Researcher → Writer)"
echo "============================================================"
echo "Query: Quantum computing practical applications"
echo ""

curl -s -X POST "$API_URL/agents/swarm" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Research quantum computing practical applications in 2 paragraphs",
    "maxSteps": 5
  }' | jq '{
    agentsUsed: .data.agentsUsed,
    totalSteps: .data.totalSteps,
    workflow: [.data.context.history[].agent]
  }'

echo ""
echo ""

echo "📊 Example 3: Direct Report (Triage → Writer)"
echo "=============================================="
echo "Query: AI trends report"
echo ""

curl -s -X POST "$API_URL/agents/swarm" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a brief report on AI trends in healthcare",
    "maxSteps": 5
  }' | jq '{
    agentsUsed: .data.agentsUsed,
    totalSteps: .data.totalSteps,
    workflow: [.data.context.history[].agent]
  }'

echo ""
echo ""

echo "🌊 Example 4: Streaming Swarm"
echo "=============================="
echo "Query: Renewable energy analysis"
echo ""
echo "Note: This shows real-time agent transitions"
echo ""

curl -X POST "$API_URL/agents/swarm/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze renewable energy market trends",
    "maxSteps": 5
  }' | grep -E "agent_start|handoff|complete" | head -10

echo ""
echo ""
echo "✅ Phase 15 Demo Complete!"
echo ""
echo "🎉 CONGRATULATIONS! All 16 Phases Complete!"
echo ""
echo "Key Observations:"
echo "  ✓ Triage routes to appropriate specialists"
echo "  ✓ Agents collaborate through handoffs"
echo "  ✓ Context preserved across transitions"
echo "  ✓ Streaming provides real-time updates"
echo "  ✓ Dynamic workflow based on task complexity"
