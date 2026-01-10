# Phase 16: Real-World Features Plan

> **Problem**: We've built powerful AI infrastructure (RAG, Agents, HITL, Memory, Jobs, Observability) but only demonstrated them with toy examples. Time to build production-ready features that companies actually need in 2026.

---

## 📊 Current Infrastructure Inventory

| Component | What We Built | Current Usage |
|-----------|--------------|---------------|
| **RAG Pipeline** | Chunking, pgvector, hybrid search, reranking, query reformulation, semantic cache | "Query documents" demo |
| **Agent System** | LangGraph workflows, Plan→Act→Reflect, tool execution | Generic "research agent" |
| **Multi-Agent Swarm** | Triage→Research→Analyst→Writer handoffs | Abstract routing demo |
| **Human-in-the-Loop** | Approval requests, checkpoints, resume workflows | Risk-level gates demo |
| **Memory System** | Buffer (recent), Session (Redis), Long-term (Postgres) | Basic preference storage |
| **Background Jobs** | BullMQ queues, document/workflow workers | Async ingestion demo |
| **Observability** | Langfuse tracing, token tracking, cost monitoring | Trace logging only |

---

## 🎯 Real-World Feature Candidates

### Tier 1: High Impact, Uses Most Infrastructure

#### 1. **Autonomous Customer Support Agent** ⭐ RECOMMENDED
```
┌─────────────────────────────────────────────────────────────────┐
│                    Customer Support System                       │
├─────────────────────────────────────────────────────────────────┤
│  User Message → Triage Agent → Route to Specialist              │
│                    │                                             │
│         ┌─────────┴─────────┐                                   │
│         ▼                   ▼                                   │
│   Technical Agent     Billing Agent    Escalation Agent         │
│         │                   │               │                   │
│         ▼                   ▼               ▼                   │
│   RAG: Docs/FAQs      RAG: Policies    HITL: Human Review       │
│         │                   │               │                   │
│         └─────────┬─────────┘               │                   │
│                   ▼                         ▼                   │
│            Response + Memory          Create Ticket             │
└─────────────────────────────────────────────────────────────────┘
```

**Infrastructure Used:**
- ✅ RAG: Knowledge base (FAQs, docs, policies)
- ✅ Swarm: Triage → Specialist agents
- ✅ Memory: Customer history, preferences, past issues
- ✅ HITL: Escalation to human, refund approvals
- ✅ Background Jobs: Ticket creation, follow-up scheduling
- ✅ Observability: Response quality tracking, resolution time

**Implementation Scope:**
```typescript
// New packages/support-agent/
├── agents/
│   ├── triage.ts      // Route to correct specialist
│   ├── technical.ts   // Product/tech support
│   ├── billing.ts     // Billing/subscription issues
│   └── escalation.ts  // Human handoff
├── tools/
│   ├── ticket.ts      // Create/update tickets
│   ├── refund.ts      // Process refunds (HITL)
│   └── account.ts     // Account actions
└── knowledge/
    └── ingest.ts      // FAQ/doc ingestion pipeline
```

---

#### 2. **AI Sales Development Representative (SDR)**
```
┌─────────────────────────────────────────────────────────────────┐
│                     AI SDR Pipeline                              │
├─────────────────────────────────────────────────────────────────┤
│  Lead Input → Research Agent → Qualify Agent → Outreach Agent   │
│                    │               │               │             │
│                    ▼               ▼               ▼             │
│            RAG: Company DB    Scoring Logic    HITL: Approve    │
│            + Web Search                        Email Draft      │
│                    │               │               │             │
│                    └───────┬───────┘               │             │
│                            ▼                       ▼             │
│                    Memory: Prospect         Background Job:     │
│                    History & Context        Schedule Follow-up  │
└─────────────────────────────────────────────────────────────────┘
```

**Infrastructure Used:**
- ✅ RAG: Company information, CRM data, industry knowledge
- ✅ Swarm: Research → Qualify → Personalize → Outreach
- ✅ Memory: Prospect interaction history, preferences
- ✅ HITL: Email/call approval before sending
- ✅ Background Jobs: Follow-up sequences, reminders
- ✅ Observability: Reply rates, conversion tracking

**Key Differentiator:** Unlike generic "email generators", this:
- Maintains full prospect context across interactions
- Requires human approval for actual outreach
- Learns from successful/failed interactions

---

#### 3. **Meeting Intelligence & Action Items**
```
┌─────────────────────────────────────────────────────────────────┐
│                    Meeting Intelligence                          │
├─────────────────────────────────────────────────────────────────┤
│  Audio/Transcript → Process Agent → Extract Agent → Action Agent│
│                          │               │               │       │
│                          ▼               ▼               ▼       │
│                    Summarize      Extract:          Create:      │
│                    Key Points    - Decisions       - Tasks       │
│                                  - Action Items    - Follow-ups  │
│                                  - Commitments     - Reminders   │
│                          │               │               │       │
│                          └───────┬───────┴───────────────┘       │
│                                  ▼                               │
│                    RAG: Past Meetings + Project Context          │
│                    Memory: Attendee Preferences                  │
│                    Background: Send Summary + Create Tasks       │
└─────────────────────────────────────────────────────────────────┘
```

**Infrastructure Used:**
- ✅ RAG: Past meeting context, project docs
- ✅ Swarm: Transcribe → Summarize → Extract → Create
- ✅ Memory: Attendee preferences, recurring topics
- ✅ HITL: Approve before sending summaries
- ✅ Background Jobs: Email summaries, create tasks in PM tools
- ✅ Observability: Accuracy tracking, user feedback

---

### Tier 2: Vertical-Specific Features

#### 4. **Legal Document Assistant**
- RAG: Case law, contract templates, regulations
- HITL: Document generation approval (high stakes)
- Memory: Case context, client preferences
- Observability: Full audit trail (compliance requirement)

#### 5. **Compliance & Risk Monitor**
- RAG: Regulatory documents, internal policies
- Background Jobs: Continuous monitoring, alerts
- HITL: Alert review and escalation
- Observability: Complete audit logs

#### 6. **Content Production Pipeline**
- Swarm: Research → Draft → Edit → SEO → Format
- RAG: Brand guidelines, past content, industry data
- HITL: Publish approval
- Memory: Brand voice, content preferences
- Background Jobs: Scheduling, distribution

---

## 🚀 Recommended Implementation: Customer Support Agent

### Why This First?
1. **Universal need** - Every SaaS needs support automation
2. **Uses ALL infrastructure** - Perfect showcase
3. **Clear value prop** - Measurable ROI (cost per ticket)
4. **Incremental deployment** - Can start with FAQ bot, expand
5. **HITL is critical** - Real safety requirement, not contrived

---

### Phase 16A: Support Agent Foundation (3-4 hours)

#### Schema Additions
```typescript
// packages/db-schema/src/schema.ts

// Tickets for support tracking
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: text('customer_id').notNull(),
  subject: text('subject').notNull(),
  status: pgEnum('ticket_status', ['open', 'pending', 'resolved', 'escalated']),
  priority: pgEnum('priority', ['low', 'medium', 'high', 'urgent']),
  category: text('category'), // billing, technical, general
  assignedTo: text('assigned_to'), // agent or human
  conversationId: uuid('conversation_id').references(() => conversations.id),
  resolution: text('resolution'),
  satisfactionScore: integer('satisfaction_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  metadata: jsonb('metadata')
});

// Customer profiles for memory
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  plan: text('plan'), // free, pro, enterprise
  accountAge: integer('account_age_days'),
  totalTickets: integer('total_tickets').default(0),
  avgSatisfaction: integer('avg_satisfaction'),
  tags: jsonb('tags').$type<string[]>(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Knowledge base articles
export const knowledgeArticles = pgTable('knowledge_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  tags: jsonb('tags').$type<string[]>(),
  viewCount: integer('view_count').default(0),
  helpfulCount: integer('helpful_count').default(0),
  notHelpfulCount: integer('not_helpful_count').default(0),
  status: pgEnum('article_status', ['draft', 'published', 'archived']),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});
```

#### Support Agents
```typescript
// packages/ai-engine/src/support/agents.ts

export const supportAgents: Record<string, Agent> = {
  triage: {
    name: 'Support Triage',
    role: 'router',
    systemPrompt: `You are a support triage agent. Analyze the customer's issue and route to the appropriate specialist.

Customer Context:
- Plan: {plan}
- Account Age: {accountAge} days
- Past Issues: {pastIssues}

Route to:
- "technical": Product bugs, feature questions, how-to
- "billing": Payments, subscriptions, refunds, invoices
- "account": Login issues, settings, permissions
- "escalation": Angry customer, complex issue, VIP customer

Consider customer sentiment and history when routing.`,
    tools: { classifyIntent, getSentiment },
    canHandoff: ['technical', 'billing', 'account', 'escalation']
  },

  technical: {
    name: 'Technical Support',
    role: 'specialist',
    systemPrompt: `You are a technical support specialist. Help customers with product issues.

Guidelines:
1. Search knowledge base first
2. Provide step-by-step instructions
3. Include relevant documentation links
4. If issue persists after 2 attempts, escalate

You have access to:
- Knowledge base search
- Product documentation
- Feature status (what's available on their plan)`,
    tools: { ragSearch, checkFeatureAccess, createTicket },
    canHandoff: ['escalation', 'triage']
  },

  billing: {
    name: 'Billing Support',
    role: 'specialist',
    systemPrompt: `You are a billing support specialist. Handle payment and subscription issues.

Guidelines:
1. Verify customer identity before account changes
2. Explain charges clearly with dates
3. For refunds > $50: MUST use escalation for human approval
4. Never promise refunds you can't approve

You have access to:
- Billing history
- Subscription details
- Refund tool (requires approval for large amounts)`,
    tools: { getBillingHistory, getSubscription, requestRefund },
    canHandoff: ['escalation', 'triage']
  },

  escalation: {
    name: 'Escalation Handler',
    role: 'escalation',
    systemPrompt: `You are the escalation handler. Your job is to:
1. Summarize the issue clearly for human review
2. Create a priority ticket
3. Set customer expectations for response time
4. Offer interim solutions if possible

Always be empathetic - escalated customers are often frustrated.`,
    tools: { createUrgentTicket, notifyHuman, offerCompensation },
    canHandoff: []  // Terminal - waits for human
  }
};
```

#### Support Tools
```typescript
// packages/ai-engine/src/support/tools.ts

export const requestRefund = tool({
  description: 'Request a refund for a customer',
  parameters: z.object({
    customerId: z.string(),
    amount: z.number(),
    reason: z.string(),
    transactionId: z.string().optional()
  }),
  execute: async ({ customerId, amount, reason, transactionId }) => {
    // Small refunds: auto-approve
    if (amount <= 50) {
      return { approved: true, method: 'auto', refundId: `ref_${Date.now()}` };
    }

    // Large refunds: require human approval
    const approval = await requestApproval(
      `refund_${customerId}`,
      'process_refund',
      `Refund $${amount} for ${customerId}: ${reason}`,
      { customerId, amount, reason, transactionId },
      'high'
    );

    return {
      approved: false,
      pendingApproval: approval.id,
      message: 'Refund requires manager approval. We\'ll notify you within 24 hours.'
    };
  }
});

export const createUrgentTicket = tool({
  description: 'Create urgent ticket for human review',
  parameters: z.object({
    customerId: z.string(),
    subject: z.string(),
    summary: z.string(),
    priority: z.enum(['high', 'urgent']),
    category: z.string()
  }),
  execute: async (params) => {
    // Queue for human review
    const jobId = await queueWorkflow('escalation', {
      ...params,
      notifySlack: true,
      notifyEmail: true
    });

    return {
      ticketId: `TKT-${Date.now()}`,
      jobId,
      estimatedResponse: params.priority === 'urgent' ? '1 hour' : '4 hours'
    };
  }
});
```

---

### Phase 16B: Knowledge Base Integration (2-3 hours)

```typescript
// apps/api/src/routes/support.ts

export const supportRoutes = new Hono();

/**
 * POST /support/chat
 * Main support chat endpoint
 */
supportRoutes.post('/chat', async (c) => {
  const { customerId, message, conversationId } = await c.req.json();

  // Load customer context
  const customer = await getCustomer(customerId);
  const memory = new MemoryManager(customerId, conversationId);
  const context = await memory.getContext();

  // Get past tickets for context
  const pastTickets = await getRecentTickets(customerId, 5);

  // Run support swarm
  const result = await runSupportSwarm(message, {
    customer,
    context,
    pastTickets,
    conversationId
  });

  // Update memory
  await memory.addMessage('user', message);
  await memory.addMessage('assistant', result.response);

  // Track in Langfuse
  const trace = createTrace('support_chat', {
    customerId,
    agentsUsed: result.agentsUsed,
    category: result.category,
    resolved: result.resolved
  });

  return c.json(createResponse(result));
});

/**
 * POST /support/knowledge/ingest
 * Ingest knowledge base articles
 */
supportRoutes.post('/knowledge/ingest', async (c) => {
  const { articles } = await c.req.json();

  for (const article of articles) {
    // Store article
    const [stored] = await db.insert(knowledgeArticles).values(article).returning();

    // Queue embedding generation
    await queueDocumentIngestion('ingest_text', {
      documentId: stored.id,
      name: article.title,
      content: article.content,
      options: {
        metadata: {
          category: article.category,
          tags: article.tags
        }
      }
    });
  }

  return c.json(createResponse({ ingested: articles.length }));
});
```

---

### Phase 16C: Metrics & Dashboard (2-3 hours)

```typescript
// apps/api/src/routes/support-metrics.ts

/**
 * GET /support/metrics
 * Support performance dashboard data
 */
supportRoutes.get('/metrics', async (c) => {
  const range = c.req.query('range') || '7d';

  const metrics = await db.execute(sql`
    SELECT
      COUNT(*) as total_tickets,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
      COUNT(*) FILTER (WHERE status = 'escalated') as escalated,
      AVG(satisfaction_score) as avg_satisfaction,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60) as avg_resolution_minutes,
      COUNT(*) FILTER (WHERE assigned_to LIKE 'ai_%') as ai_handled,
      COUNT(*) FILTER (WHERE assigned_to NOT LIKE 'ai_%') as human_handled
    FROM tickets
    WHERE created_at > NOW() - INTERVAL '${range}'
  `);

  // Calculate AI deflection rate
  const deflectionRate = metrics.ai_handled / metrics.total_tickets;

  // Get top issues
  const topIssues = await db.execute(sql`
    SELECT category, COUNT(*) as count
    FROM tickets
    WHERE created_at > NOW() - INTERVAL '${range}'
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `);

  return c.json(createResponse({
    ...metrics,
    deflectionRate,
    topIssues,
    costSavings: metrics.ai_handled * 5 // $5 per deflected ticket
  }));
});
```

---

### Phase 16D: Frontend Widget (3-4 hours)

```typescript
// apps/web/app/components/SupportWidget.tsx

export function SupportWidget({ customerId }: { customerId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState<string>('');

  const sendMessage = async () => {
    // Optimistic update
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');

    // Stream response
    const response = await fetch('/api/support/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ customerId, message: input })
    });

    const reader = response.body?.getReader();
    let assistantMessage = '';

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = JSON.parse(new TextDecoder().decode(value));

      if (chunk.type === 'agent_start') {
        setAgentStatus(`${chunk.agent} is helping...`);
      } else if (chunk.type === 'content') {
        assistantMessage += chunk.content;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            last.content = assistantMessage;
          } else {
            updated.push({ role: 'assistant', content: assistantMessage });
          }
          return updated;
        });
      } else if (chunk.type === 'escalation') {
        setAgentStatus('Connecting you with a human agent...');
      }
    }
  };

  return (
    <div className="support-widget">
      <MessageList messages={messages} />
      {agentStatus && <AgentStatus status={agentStatus} />}
      <ChatInput value={input} onChange={setInput} onSend={sendMessage} />
    </div>
  );
}
```

---

## 📋 Implementation Checklist

### Phase 16A: Foundation
- [ ] Add schema: tickets, customers, knowledge_articles
- [ ] Create support agents: triage, technical, billing, escalation
- [ ] Implement support tools: refund, ticket, notify
- [ ] Wire up support swarm orchestrator

### Phase 16B: Knowledge Base
- [ ] Create knowledge ingestion pipeline
- [ ] Add RAG search for support context
- [ ] Implement article feedback tracking
- [ ] Build auto-suggest from knowledge base

### Phase 16C: Intelligence
- [ ] Customer sentiment analysis
- [ ] Priority auto-classification
- [ ] Response quality scoring (Langfuse)
- [ ] Escalation prediction

### Phase 16D: Frontend
- [ ] Chat widget component
- [ ] Agent status indicators
- [ ] Escalation flow UI
- [ ] Satisfaction survey

### Phase 16E: Metrics
- [ ] Deflection rate tracking
- [ ] Resolution time metrics
- [ ] Cost savings calculation
- [ ] Agent performance comparison

---

## 🎯 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| AI Deflection Rate | >60% | Tickets resolved without human |
| First Response Time | <5s | Time to first AI response |
| Resolution Time (AI) | <3min | Time to resolve AI-handled tickets |
| CSAT Score | >4.0/5 | Customer satisfaction surveys |
| Escalation Rate | <20% | Tickets requiring human |
| Cost per Ticket | <$2 | Total support cost / tickets |

---

## 🔮 Future Extensions

After Support Agent, consider:

1. **AI SDR** - Same infrastructure, different domain
2. **Meeting Intelligence** - Add audio processing
3. **Internal Help Desk** - IT support variant
4. **Onboarding Agent** - Guide new users

Each reuses 80%+ of the support infrastructure with domain-specific agents and knowledge bases.

---

## 📝 Notes

This plan demonstrates how to transform our "demo infrastructure" into production features. The key insight: **infrastructure is reusable, value comes from domain-specific implementation**.

The Support Agent is the ideal first feature because:
1. Clear business value (cost reduction)
2. Natural use of ALL our infrastructure
3. HITL is genuinely needed (refunds, escalation)
4. Memory provides real personalization
5. Observability enables continuous improvement
