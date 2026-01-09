#!/bin/bash

# Test Phase 15: Multi-Agent Swarm

echo "🎯 Phase 15: Multi-Agent Swarm Testing"
echo "=========================================="
echo ""

API_URL="http://localhost:3001"

echo "1️⃣  Testing Basic Swarm (Research → Analyst → Writer)"
echo "---------------------------------------------------"
curl -X POST "$API_URL/agents/swarm" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a competitive analysis report for Tesla vs Rivian",
    "maxSteps": 5
  }' | jq '.'

echo ""
echo ""

echo "2️⃣  Testing Swarm with Complex Task"
echo "---------------------------------------------------"
curl -X POST "$API_URL/agents/swarm" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Research the AI chip market and create a summary with key insights",
    "maxSteps": 5
  }' | jq '.'

echo ""
echo ""

echo "3️⃣  Testing Stream Swarm"
echo "---------------------------------------------------"
curl -X POST "$API_URL/agents/swarm/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze the current state of quantum computing and its practical applications",
    "maxSteps": 5
  }'

echo ""
echo ""
echo "✅ Phase 15 Testing Complete!"
echo ""
echo "🎉 CONGRATULATIONS! All 16 Phases Complete!"
echo ""
echo "Summary of what you've built:"
echo "  ✅ Monorepo with TurboRepo"
echo "  ✅ Hono API + Next.js frontend"
echo "  ✅ LLM integration with Vercel AI SDK"
echo "  ✅ Prompt templates and model routing"
echo "  ✅ PostgreSQL + Drizzle ORM"
echo "  ✅ Vector search with pgvector"
echo "  ✅ Document ingestion pipeline"
echo "  ✅ Hybrid RAG retrieval"
echo "  ✅ Advanced RAG with reranking"
echo "  ✅ LangGraph agents"
echo "  ✅ Cyclic workflows with reflection"
echo "  ✅ Human-in-the-loop approval"
echo "  ✅ Multi-tier memory system"
echo "  ✅ Background jobs with BullMQ"
echo "  ✅ Observability with Langfuse"
echo "  ✅ GraphRAG with Neo4j"
echo "  ✅ Multi-agent swarm orchestration"
