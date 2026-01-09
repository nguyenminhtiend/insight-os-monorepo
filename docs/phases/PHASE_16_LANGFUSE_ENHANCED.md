# Phase 16: Enhanced Langfuse Observability

> **Goal:** Integrate advanced Langfuse features with the Multi-Agent Swarm for production-grade LLM observability.

> **Prerequisite:** Complete Phase 15 (Multi-Agent Swarm) first.

---

## Why Wait Until After Phase 15?

The current Langfuse implementation (Phase 13) uses basic tracing that any APM tool can do. Phase 15's multi-agent swarm provides a **real-world use case** where Langfuse's LLM-specific features shine:

- **Multiple LLM calls per request** → Track cost per agent
- **Agent handoffs** → Visualize the workflow path
- **Complex orchestration** → Debug why agent X handed off to agent Y
- **Multi-step reasoning** → Evaluate quality at each step

---

## Features to Implement

### 1. Per-Agent Cost Tracking

```typescript
// In orchestrator.ts - wrap each agent call
const generation = trace.generation({
  name: `${agent.name} - ${agent.role}`,
  model: 'gpt-4o-mini',
  input: input,
  metadata: { agentRole: agent.role }
});

const result = await generateText({...});

generation.end({
  output: result.text,
  usage: {
    input: result.usage.promptTokens,
    output: result.usage.completionTokens
  }
});
```

### 2. Session Grouping for Swarm Runs

```typescript
// Group all agents in a swarm run under one session
const trace = langfuse.trace({
  name: 'Multi-Agent Swarm',
  sessionId: `swarm-${Date.now()}`, // Links all agents together
  userId: userId,
  metadata: { query: originalQuery },
});
```

### 3. Handoff Tracing as Spans

```typescript
// Track handoffs between agents
const handoffSpan = trace.span({
  name: `Handoff: ${fromAgent} → ${toAgent}`,
  input: { context: handoffContext, data: handoffData },
  metadata: { fromAgent, toAgent },
});
handoffSpan.end();
```

### 4. Quality Scores per Agent

```typescript
// Score each agent's output
trace.score({
  name: 'agent_output_quality',
  value: 0.85,
  comment: `${agent.name} output evaluation`,
});

trace.score({
  name: 'routing_accuracy',
  value: 1.0,
  comment: 'Triage correctly routed to researcher',
});
```

### 5. Prompt Versioning per Agent

```typescript
// Store agent prompts in Langfuse for versioning
const prompt = await langfuse.getPrompt('researcher-agent-v2');
const compiledPrompt = prompt.compile({
  topic: query,
  guidelines: customGuidelines,
});
```

---

## Expected Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  SWARM REQUEST                                              │
│  Trace (sessionId: "swarm-123")                             │
│                                                             │
│  ├─ 🤖 Generation: Triage Agent                             │
│  │     └─ cost: $0.002, tokens: 450                         │
│  │                                                          │
│  ├─ 🛠️ Span: Handoff → researcher                          │
│  │                                                          │
│  ├─ 🤖 Generation: Research Agent                           │
│  │     └─ cost: $0.015, tokens: 2,100                       │
│  │                                                          │
│  ├─ 🤖 Generation: Analyst Agent                            │
│  │     └─ cost: $0.008, tokens: 1,200                       │
│  │                                                          │
│  ├─ 🤖 Generation: Writer Agent                             │
│  │     └─ cost: $0.012, tokens: 1,800                       │
│  │                                                          │
│  └─ ⭐ Score: quality=0.85, routing_accuracy=1.0            │
│                                                             │
│  Total: $0.037 | 5,550 tokens | 4 agents                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Langfuse Features vs. Enhanced

| Feature               | Phase 13 (Current) | Phase 16 (Enhanced)  |
| --------------------- | ------------------ | -------------------- |
| Request tracing       | ✅ Basic           | ✅ Same              |
| LLM call logging      | ⚠️ Manual          | ✅ Auto per agent    |
| Cost tracking         | ❌ Not used        | ✅ Per-model pricing |
| Prompt versioning     | ❌ Not used        | ✅ Per-agent prompts |
| Quality scores        | ❌ Not used        | ✅ Agent evaluations |
| Session grouping      | ❌ Not used        | ✅ Swarm sessions    |
| Handoff visualization | ❌ Not used        | ✅ Span tracking     |

---

## Implementation Steps

### Step 1: Update Swarm Orchestrator with Tracing

Modify `packages/ai-engine/src/swarm/orchestrator.ts` to include Langfuse tracing.

### Step 2: Add Agent-Specific Generations

Wrap each `generateText` call with Langfuse generation tracking.

### Step 3: Add Session and User Context

Pass session IDs and user IDs through the swarm context.

### Step 4: Implement Quality Scoring

Add evaluation scores for agent outputs and routing decisions.

### Step 5: Migrate Prompts to Langfuse

Move agent system prompts to Langfuse for versioning and A/B testing.

---

## Demo Checklist

- [ ] Each agent's LLM call shows in Langfuse with cost
- [ ] Swarm runs are grouped by session
- [ ] Handoffs appear as spans in the trace
- [ ] Quality scores are attached to traces
- [ ] Agent prompts are versioned in Langfuse

---

## Resources

- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse TypeScript SDK](https://langfuse.com/docs/sdk/typescript)
- [Langfuse Prompt Management](https://langfuse.com/docs/prompts)
- [Langfuse Evaluations](https://langfuse.com/docs/scores)
