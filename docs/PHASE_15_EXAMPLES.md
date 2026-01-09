# Phase 15: Multi-Agent Swarm - Examples

## Example 1: Competitive Analysis

### Request
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a brief competitive analysis of Tesla vs Rivian",
    "maxSteps": 5
  }'
```

### Workflow
```
Triage Agent → "This needs analysis"
     ↓
Analyst Agent → "Analyzing competitors..."
     ↓
Writer Agent → "Creating report..."
     ↓
Final Output
```

### Output
```
Executive Summary:
Tesla and Rivian are major EV players with distinct strategies...

Market Position:
Tesla dominates with Model S/3/X/Y, extensive Supercharger network...
Rivian focuses on adventure segment with R1T pickup and R1S SUV...

Financial Performance:
Tesla shows consistent profitability with high production volumes...
Rivian faces scaling challenges while investing in manufacturing...
```

### Agents Used
- Triage Agent
- Analyst Agent
- Writer Agent

### Total Steps: 2 handoffs

---

## Example 2: Research Task

### Request
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Research quantum computing practical applications",
    "maxSteps": 5
  }'
```

### Workflow
```
Triage Agent → "This needs research"
     ↓
Research Agent → "Gathering information..."
     ↓
Writer Agent → "Summarizing findings..."
     ↓
Final Output
```

### Output
```
Executive Summary:
Quantum computing leverages quantum mechanics for unprecedented speeds...

Practical Applications:
1. Cryptography - Quantum-resistant encryption
2. Drug Discovery - Molecular simulation
3. Optimization - Logistics and supply chain
4. AI - Enhanced machine learning
```

### Agents Used
- Triage Agent
- Research Agent
- Writer Agent

### Total Steps: 2 handoffs

---

## Example 3: Simple Report (Direct Route)

### Request
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a report on AI trends in healthcare",
    "maxSteps": 5
  }'
```

### Workflow
```
Triage Agent → "Straightforward report task"
     ↓
Writer Agent → "Creating report..."
     ↓
Final Output
```

### Output
```
AI Trends in Healthcare Report

1. Diagnostic AI
   - Image analysis for radiology
   - Pathology automation

2. Personalized Medicine
   - Treatment optimization
   - Genomic analysis

3. Administrative Automation
   - Claims processing
   - Scheduling optimization
```

### Agents Used
- Triage Agent
- Writer Agent

### Total Steps: 1 handoff

---

## Example 4: Streaming Swarm

### Request
```bash
curl -X POST http://localhost:3001/agents/swarm/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze renewable energy market trends",
    "maxSteps": 5
  }' -N
```

### Stream Events
```
data: {"type":"agent_start","agent":"Triage Agent"}

data: {"type":"agent_output","agent":"Triage Agent","content":"..."}

data: {"type":"handoff","agent":"analyst","content":"..."}

data: {"type":"agent_start","agent":"Analysis Agent"}

data: {"type":"agent_output","agent":"Analysis Agent","content":"..."}

data: {"type":"handoff","agent":"writer","content":"..."}

data: {"type":"agent_start","agent":"Writer Agent"}

data: {"type":"agent_output","agent":"Writer Agent","content":"..."}

data: {"type":"complete","content":"Final report..."}

data: [DONE]
```

---

## Example 5: Complex Multi-Step Task

### Request
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Research the AI chip market, analyze key players, and create an executive summary",
    "maxSteps": 10
  }'
```

### Workflow
```
Triage Agent → "Complex task needing research"
     ↓
Research Agent → "Gathering market data..."
     ↓
Analyst Agent → "Analyzing key players..."
     ↓
Writer Agent → "Creating executive summary..."
     ↓
Final Output
```

### Potential Agents Used
- Triage Agent
- Research Agent
- Analyst Agent
- Writer Agent

### Total Steps: 3 handoffs

---

## Example 6: Extracting Workflow Information

### Get Agents Used
```bash
curl -s -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare iPhone vs Samsung"}' \
  | jq '.data.agentsUsed'
```

**Output:**
```json
["triage", "analyst", "writer"]
```

### Get Total Steps
```bash
curl -s ... | jq '.data.totalSteps'
```

**Output:**
```json
2
```

### Get Full History
```bash
curl -s ... | jq '.data.context.history'
```

**Output:**
```json
[
  {"agent": "triage", "action": "processing"},
  {"agent": "analyst", "action": "handoff received"},
  {"agent": "analyst", "action": "processing"},
  {"agent": "writer", "action": "handoff received"},
  {"agent": "writer", "action": "processing"}
]
```

### Get Just Final Output
```bash
curl -s ... | jq -r '.data.finalOutput'
```

---

## Example 7: Different Query Types

### Research Query
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Research blockchain technology applications"}' \
  -H "Content-Type: application/json"
```
**Expected**: Triage → Researcher → Writer

### Analysis Query
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Analyze cloud provider pricing models"}' \
  -H "Content-Type: application/json"
```
**Expected**: Triage → Analyst → Writer

### Report Query
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Summarize key AI developments in 2025"}' \
  -H "Content-Type: application/json"
```
**Expected**: Triage → Writer

### Comparison Query
```bash
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Compare React vs Vue.js frameworks"}' \
  -H "Content-Type: application/json"
```
**Expected**: Triage → Analyst → Writer

---

## Key Patterns

### Pattern 1: Research → Write
Best for information gathering tasks
```
"Research X" → Researcher → Writer
```

### Pattern 2: Analysis → Write
Best for data analysis and comparisons
```
"Analyze X" or "Compare X vs Y" → Analyst → Writer
```

### Pattern 3: Direct Write
Best for straightforward summaries
```
"Summarize X" or "Create report on X" → Writer
```

### Pattern 4: Research → Analyze → Write
Best for complex tasks requiring both research and analysis
```
"Research X and analyze Y" → Researcher → Analyst → Writer
```

---

## Tips for Effective Queries

### ✅ Good Queries
- "Compare Tesla vs Rivian EV strategies"
- "Research quantum computing applications"
- "Analyze cloud provider pricing"
- "Create a summary of AI trends"

### ❌ Less Optimal Queries
- "Tell me about Tesla" (too vague)
- "What?" (no context)
- "Research everything about AI" (too broad)

### Best Practices
1. **Be specific**: Include concrete topics
2. **State intent**: "Compare", "Research", "Analyze", "Create"
3. **Set constraints**: "in 3 paragraphs", "brief summary"
4. **Provide context**: "for healthcare", "in automotive"

---

## Debugging

### View Server Logs
The server logs show agent transitions:
```
[Swarm] Running Triage Agent...
[Swarm] Handoff to analyst
[Swarm] Running Analysis Agent...
[Swarm] Handoff to writer
[Swarm] Running Writer Agent...
[Swarm] Task complete by Writer Agent
```

### Common Issues

**Issue**: Agent loops forever
**Solution**: Set `maxSteps` appropriately (5-10 usually enough)

**Issue**: Invalid agent handoff
**Solution**: Updated prompts ensure exact agent names

**Issue**: Poor routing decisions
**Solution**: Make query more specific about intent

---

## Integration Examples

### With GraphRAG (Phase 14)
Research agent could query knowledge graph, then pass to analyst

### With Memory (Phase 11)
Store swarm results in long-term memory for future queries

### With RAG (Phase 6)
Research agent could use RAG for document retrieval

### With HITL (Phase 10)
Add approval checkpoints between agent handoffs

---

## Performance Notes

- **Average execution time**: 10-15 seconds for 2-3 agents
- **Streaming**: Updates every 1-2 seconds
- **Token usage**: ~2000-4000 tokens per swarm
- **Cost**: $0.01-0.02 per request (GPT-4o-mini)

---

**Ready to build amazing multi-agent workflows!** 🚀
