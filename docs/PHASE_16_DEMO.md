# Phase 16 Demo - Customer Support Agent

## 🎬 Live Demo Script

Follow this script to demonstrate the full customer support system.

---

## Prerequisites

1. **Start services:**
```bash
# Terminal 1: API
cd apps/api && pnpm dev

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Optional Terminal 3: Langfuse (for observability)
# Run your Langfuse instance
```

2. **Verify health:**
```bash
curl http://localhost:3001/health
```

---

## Demo Flow (10 minutes)

### 1. Setup Customer & Knowledge Base (2 min)

```bash
# Create test customer
curl -X POST http://localhost:3001/support/customers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo_customer",
    "email": "demo@acme.com",
    "name": "Demo User",
    "plan": "pro"
  }'
```

```bash
# Ingest knowledge articles
curl -X POST http://localhost:3001/support/knowledge/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "title": "How to Reset Password",
        "content": "1. Click Forgot Password\n2. Enter email\n3. Check inbox\n4. Click reset link",
        "category": "account",
        "tags": ["password", "login"]
      },
      {
        "title": "Refund Policy",
        "content": "Refunds within 30 days. Small refunds (<$50) auto-approved. Large refunds require review.",
        "category": "billing",
        "tags": ["refund", "billing"]
      },
      {
        "title": "API Rate Limits",
        "content": "Free: 100/hr, Pro: 1000/hr, Enterprise: unlimited",
        "category": "technical",
        "tags": ["api", "limits"]
      }
    ]
  }' | jq
```

**Expected**: 3 articles ingested, embeddings queued

---

### 2. Simple Query - Password Reset (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "I forgot my password, how do I reset it?"
  }' | jq
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "response": "I'll help you reset your password...\n1. Click Forgot Password\n...",
    "agentsUsed": ["triage", "account"],
    "category": "account",
    "resolved": true,
    "requiresHuman": false
  }
}
```

**Key Points:**
- ✅ Triage → Account agent
- ✅ Used `sendPasswordReset` tool
- ✅ Resolved without human
- ✅ <5 seconds response

---

### 3. Billing Question with Context (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "When is my next payment and how much will it be?"
  }' | jq '.data.response'
```

**Expected:**
```
"Based on your Pro plan, your next payment of $99 will be on
February 1st, 2026. You're billed monthly on the 1st of each month."
```

**Key Points:**
- ✅ Triage → Billing agent
- ✅ Used `getSubscription` tool
- ✅ Customer context (Pro plan)
- ✅ Specific dates and amounts

---

### 4. Small Refund - Auto-Approved (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "I was accidentally charged $25. Can I get a refund?"
  }' | jq
```

**Expected:**
```json
{
  "response": "I've processed your refund of $25. It will appear in 5-7 business days...",
  "agentsUsed": ["triage", "billing"],
  "resolved": true,
  "requiresHuman": false
}
```

**Key Points:**
- ✅ Auto-approved (≤$50 threshold)
- ✅ No human approval needed
- ✅ Instant resolution
- 💰 Tool: `requestRefund` returned `approved: true`

---

### 5. Large Refund - Requires Approval (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "I need a refund of $200 please"
  }' | jq
```

**Expected:**
```json
{
  "response": "...submitted for manager review. You'll receive notification within 24 hours...",
  "agentsUsed": ["triage", "billing"],
  "resolved": false,
  "requiresHuman": true
}
```

**Now check approvals:**
```bash
curl http://localhost:3001/agents/approvals | jq
```

**Expected:**
```json
{
  "data": {
    "approvals": [
      {
        "id": "apr_...",
        "action": "process_refund",
        "description": "Refund request: $200...",
        "riskLevel": "high",
        "status": "pending"
      }
    ]
  }
}
```

**Key Points:**
- ✅ HITL triggered (>$50)
- ✅ Approval request created
- ✅ Human review required
- 🔒 Safety gate working

---

### 6. Technical Question with RAG (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "What are the API rate limits on my plan?"
  }' | jq '.data.response'
```

**Expected:**
```
"As a Pro plan customer, your API rate limit is 1,000 requests per hour.
If you need more, you can upgrade to Enterprise for unlimited access."
```

**Key Points:**
- ✅ Triage → Technical agent
- ✅ Used `ragSearch` (knowledge base)
- ✅ Used `checkFeatureAccess` (plan check)
- ✅ Personalized to customer's plan
- 📚 RAG retrieved relevant article

---

### 7. Angry Customer - Escalation (1 min)

```bash
curl -X POST http://localhost:3001/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "demo_customer",
    "message": "This is ridiculous! Nothing works and I want a manager RIGHT NOW!"
  }' | jq
```

**Expected:**
```json
{
  "response": "I understand your frustration... I've created an urgent ticket (TKT-...) for immediate review...",
  "agentsUsed": ["triage", "escalation"],
  "requiresHuman": true,
  "resolved": false
}
```

**Key Points:**
- ✅ Detected anger/urgency
- ✅ Escalated immediately
- ✅ Created urgent ticket
- ✅ Notified human agents
- 🚨 Proper escalation flow

---

### 8. View Metrics Dashboard (2 min)

```bash
# Overall support metrics
curl 'http://localhost:3001/support/metrics?range=7d' | jq
```

**Expected:**
```json
{
  "data": {
    "summary": {
      "totalTickets": 6,
      "resolved": 3,
      "escalated": 2,
      "aiHandled": 4,
      "humanHandled": 2,
      "deflectionRate": 66.7,
      "avgResolutionMinutes": 0.5,
      "costSavings": 20
    },
    "topIssues": [
      { "category": "billing", "count": 3 },
      { "category": "account", "count": 2 },
      { "category": "technical", "count": 1 }
    ]
  }
}
```

```bash
# Customer-specific metrics
curl http://localhost:3001/support/metrics/customer/demo_customer | jq
```

```bash
# Knowledge base effectiveness
curl http://localhost:3001/support/metrics/knowledge | jq
```

**Key Points:**
- ✅ AI deflection: 66.7%
- ✅ Cost savings: $20 (4 tickets × $5)
- ✅ Resolution time: <1 minute
- ✅ Category breakdown visible
- 📊 Actionable metrics

---

## Demo Highlights

### What We Just Demonstrated

| Feature | Scenario | Agent Path | Outcome |
|---------|----------|-----------|---------|
| **Routing** | Password reset | Triage → Account | Auto-resolved |
| **Context** | Billing question | Triage → Billing | Plan-aware answer |
| **Auto-approval** | Small refund | Triage → Billing | Instant approval |
| **HITL Safety** | Large refund | Triage → Billing | Approval required |
| **RAG Search** | API limits | Triage → Technical | KB article used |
| **Escalation** | Angry customer | Triage → Escalation | Human notified |
| **Metrics** | Dashboard | - | Business insights |

### Infrastructure in Action

- **RAG**: Knowledge base search for technical questions
- **Swarm**: 6 agent handoffs across scenarios
- **Memory**: Customer plan/history used in responses
- **HITL**: 2 approval requests created
- **Jobs**: Background ticket creation
- **Observability**: All traced in Langfuse

---

## Q&A Talking Points

**Q: How does this compare to existing chatbots?**
A: Traditional chatbots are rule-based or single-model. This is a **multi-agent system** with:
- Specialized agents per domain
- RAG for dynamic knowledge
- HITL for genuine safety
- Full customer context
- Business metrics tracking

**Q: What about hallucinations?**
A: Multiple safety layers:
- RAG grounds answers in knowledge base
- Tool outputs are deterministic (no generation)
- HITL gates for high-risk actions
- Escalation for uncertainty
- Langfuse observability for monitoring

**Q: Can this scale?**
A: Yes:
- Stateless agents (horizontal scaling)
- Background jobs (async processing)
- Redis caching (semantic + session)
- Database indexing (fast lookups)
- Cost per ticket stays <$2

**Q: How long to customize for my business?**
A: Pattern is reusable:
- Add your knowledge base (1-2 days)
- Customize agents/prompts (2-3 days)
- Add domain-specific tools (3-5 days)
- Configure HITL thresholds (1 day)
- **Total: 1-2 weeks to production**

**Q: What about other languages/regions?**
A: LLMs handle multilingual out of box. Add:
- Translated knowledge base
- Region-specific routing rules
- Localized metric tracking

---

## Success Criteria

After demo, audience should understand:

1. ✅ This is **production-ready**, not a demo
2. ✅ HITL is **genuinely needed** (business risk)
3. ✅ Metrics are **business-focused** (deflection, cost, CSAT)
4. ✅ Architecture is **reusable** (support → sales → help desk)
5. ✅ Infrastructure → Product → Value pipeline

---

## Next Steps

1. Review `/docs/PHASE_16_COMPLETE.md` for full docs
2. Run `./test-phase16.sh` for automated testing
3. Check Langfuse dashboard for trace analysis
4. Customize for your domain (see customization guide)
5. Deploy to production with monitoring

---

**This demo shows how to build real AI products, not proof-of-concepts.**
