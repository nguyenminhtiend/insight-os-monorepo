# Phase 16 Support Agent - Quick Start

## Run Tests

```bash
./test-phase16.sh
```

## What Gets Tested

1. ✅ Customer creation
2. ✅ Knowledge base ingestion (3 articles)
3. ✅ Password reset (Account agent)
4. ✅ Billing inquiry (Billing agent + tools)
5. ✅ Small refund $30 (auto-approved)
6. ✅ Large refund $150 (requires HITL approval)
7. ✅ API rate limits (Technical agent + RAG)
8. ✅ Angry customer (escalation to human)
9. ✅ Customer details retrieval
10. ✅ Knowledge base listing
11. ✅ Support metrics dashboard
12. ✅ Customer-specific metrics
13. ✅ Knowledge base metrics
14. ✅ HITL approval tracking

## Architecture

```
User Query
    ↓
Triage Agent (routes based on intent)
    ↓
┌──────────┬──────────┬──────────┬───────────┐
│Technical │ Billing  │ Account  │Escalation │
│(RAG)     │(HITL $)  │(Password)│(Human)    │
└──────────┴──────────┴──────────┴───────────┘
    ↓
Response + Memory + Metrics
```

## Key Features

- **Multi-agent swarm** with intelligent routing
- **RAG integration** for knowledge base
- **HITL approval** for refunds >$50
- **Memory** tracks customer history
- **Background jobs** for tickets/notifications
- **Full observability** via Langfuse
- **Metrics dashboard** with cost savings

## API Endpoints

```
POST /support/chat                 # Main support chat
POST /support/chat/stream          # Streaming chat
POST /support/customers            # Create customer
GET  /support/customers/:id        # Get customer
POST /support/knowledge/ingest     # Ingest articles
GET  /support/knowledge            # List articles
GET  /support/tickets              # List tickets
GET  /support/metrics              # Overall metrics
GET  /support/metrics/customer/:id # Customer metrics
GET  /support/metrics/knowledge    # KB metrics
```

## Expected Outcomes

- **Deflection rate**: AI handles 70-80% without human
- **Resolution time**: <3 minutes for AI-handled
- **HITL triggers**: Large refunds, angry customers, VIPs
- **Cost savings**: $5 per deflected ticket

See `PHASE_16_COMPLETE.md` for full documentation.
