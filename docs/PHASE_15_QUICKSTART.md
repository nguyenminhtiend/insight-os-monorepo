# Phase 15: Multi-Agent Swarm - Quick Start

## Prerequisites

- API server running: `cd apps/api && pnpm dev`
- OpenAI API key configured

## What is Multi-Agent Swarm?

A swarm is a system where specialized agents collaborate through **handoffs** to solve complex tasks:

```
User Query → Triage → [Researcher|Analyst] → Writer → Final Output
```

## Quick Test

### 1. Basic Swarm Request

```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare Tesla vs Rivian", "maxSteps": 5}'
```

### 2. View Results

```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare Tesla vs Rivian", "maxSteps": 5}' \
  | jq '.data.finalOutput'
```

### 3. See Workflow

```bash
curl -X POST http://localhost:3001/agents/swarm \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare Tesla vs Rivian", "maxSteps": 5}' \
  | jq '{agents: .data.agentsUsed, steps: .data.totalSteps}'
```

### 4. Stream in Real-Time

```bash
curl -X POST http://localhost:3001/agents/swarm/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Research quantum computing", "maxSteps": 5}' \
  -N
```

## Available Agents

| Agent | Role | When Used |
|-------|------|-----------|
| **Triage** | Router | First agent, routes to specialists |
| **Researcher** | Gather info | For research & fact-finding tasks |
| **Analyst** | Analyze data | For comparisons & insights |
| **Writer** | Create output | Final agent, produces deliverable |

## Example Workflows

### Competitive Analysis
```
Triage → Analyst → Writer
```

### Research Report
```
Triage → Researcher → Writer
```

### Simple Report
```
Triage → Writer
```

## Testing Different Queries

```bash
# Research task
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Research AI chip market"}' \
  -H "Content-Type: application/json"

# Analysis task
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Analyze cloud provider pricing"}' \
  -H "Content-Type: application/json"

# Direct report
curl -X POST http://localhost:3001/agents/swarm \
  -d '{"query": "Summarize blockchain trends"}' \
  -H "Content-Type: application/json"
```

## Key Parameters

- `query` (required): The task to perform
- `maxSteps` (optional): Max handoffs allowed (default: 10)

## Response Structure

```json
{
  "success": true,
  "data": {
    "finalOutput": "...",
    "agentsUsed": ["triage", "analyst", "writer"],
    "totalSteps": 2,
    "context": {
      "messages": [...],
      "history": [...]
    }
  }
}
```

## Stream Events

When using `/swarm/stream`:

- `agent_start`: Agent begins work
- `agent_output`: Agent produces result
- `handoff`: Agent passes to another
- `complete`: Task finished

## Common Patterns

### View Agent Flow
```bash
curl -s ... | jq '.data.context.history[].agent'
```

### Extract Final Output
```bash
curl -s ... | jq -r '.data.finalOutput'
```

### Count Handoffs
```bash
curl -s ... | jq '.data.totalSteps'
```

## Run Full Test Suite

```bash
./test-phase15.sh
```

## Tips

1. **Streaming** shows real-time progress
2. **maxSteps** prevents infinite loops
3. **Triage** always runs first
4. **Writer** never hands off (terminal)
5. Watch server logs for debugging

## What's Next?

You've completed all 16 phases! 🎉

Consider:
- Adding authentication
- Building UI components
- Deploying to production
- Adding more specialized agents
- Integrating with GraphRAG (Phase 14)
- Using memory system (Phase 11)

---

**Happy Swarming!** 🐝
