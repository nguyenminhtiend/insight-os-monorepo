#!/bin/bash
# Phase 2 API Testing Script

API_URL="http://localhost:3001"

echo "🚀 Testing Phase 2: LLM Advanced Features"
echo "=========================================="
echo ""

echo "1️⃣  List available prompts:"
curl -s $API_URL/analyze/prompts | jq '.data[] | {path, name}'
echo ""

echo "2️⃣  Structured company analysis (Tesla):"
curl -s -X POST $API_URL/analyze/company \
  -H "Content-Type: application/json" \
  -d '{"company": "Tesla"}' | jq '{
    company: .data.analysis.company,
    ticker: .data.analysis.ticker,
    sentiment: .data.analysis.sentiment,
    marketPosition: .data.analysis.marketPosition,
    confidence: .data.analysis.confidence,
    strengths: .data.analysis.strengths[:2],
    weaknesses: .data.analysis.weaknesses[:2]
  }'
echo ""

echo "3️⃣  Market research (AI market):"
curl -s -X POST $API_URL/analyze/research \
  -H "Content-Type: application/json" \
  -d '{"query": "artificial intelligence market", "type": "market"}' | jq '{
    query: .data.research.query,
    summary: .data.research.summary,
    keyFindingsCount: (.data.research.keyFindings | length),
    firstFinding: .data.research.keyFindings[0]
  }'
echo ""

echo "4️⃣  Auto-routed simple query:"
curl -s -X POST $API_URL/analyze/auto \
  -H "Content-Type: application/json" \
  -d '{"query": "What is generative AI?"}' | jq '{
    model: .data.routing.model,
    taskType: .data.routing.classification.taskType,
    complexity: .data.routing.classification.complexity,
    response: .data.response[:150]
  }'
echo ""

echo "5️⃣  Auto-routed complex query:"
curl -s -X POST $API_URL/analyze/auto \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare the strategic positioning of Apple, Microsoft, and Google in AI"}' | jq '{
    model: .data.routing.model,
    taskType: .data.routing.classification.taskType,
    complexity: .data.routing.classification.complexity,
    response: .data.response[:200]
  }'
echo ""

echo "✅ Phase 2 testing complete!"

