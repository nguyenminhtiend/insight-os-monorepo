# InsightOS Web App

Production-ready AI Support Dashboard built with Next.js 15, showcasing Phase 16 real-world features.

## 🎯 Pages

### Support Dashboard (`/support`)
**Real-time support performance metrics**

- **AI Deflection Rate**: Percentage of tickets resolved without human intervention
- **Cost Savings**: ROI calculation ($5 per deflected ticket)
- **Resolution Times**: Average time to resolve tickets
- **CSAT Scores**: Customer satisfaction tracking
- **Daily Volume**: Ticket trends over time
- **Top Issues**: Most common support categories
- **Agent Performance**: AI vs human comparison

### Support Chat (`/support/chat`)
**Interactive AI support interface**

- **Multi-agent routing**: Triage → Technical/Billing/Account/Escalation
- **Quick queries**: Pre-built example questions
- **Real-time responses**: Streaming AI replies
- **Agent indicators**: Shows which agent is handling request
- **Result tracking**: Agents used, category, resolution status
- **HITL indicators**: Shows when human approval required

Features demonstrated:
- ✅ RAG knowledge base search
- ✅ Auto-approve small refunds (≤$50)
- ✅ HITL for large amounts (>$50)
- ✅ Customer context awareness
- ✅ Escalation detection

### Customers (`/support/customers`)
**Customer management interface**

- **Customer list**: All customers with search
- **Ticket history**: Per-customer support tickets
- **Satisfaction scores**: CSAT tracking per customer
- **Account details**: Plan, age, total tickets
- **Quick actions**: Start chat, view details

## 🚀 Getting Started

### Prerequisites

1. **API server running:**
```bash
cd apps/api
pnpm dev  # Runs on localhost:3001
```

2. **Create demo customer:**
```bash
curl -X POST http://localhost:3001/support/customers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo_customer",
    "email": "demo@example.com",
    "name": "Demo User",
    "plan": "pro"
  }'
```

3. **Ingest knowledge base:**
```bash
curl -X POST http://localhost:3001/support/knowledge/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "title": "Password Reset Guide",
        "content": "Step by step...",
        "category": "account",
        "tags": ["password"]
      }
    ]
  }'
```

### Run Development Server

```bash
cd apps/web
pnpm dev  # Runs on localhost:3000
```

Visit:
- http://localhost:3000 - Home page with feature overview
- http://localhost:3000/support - Support dashboard
- http://localhost:3000/support/chat - Support chat interface
- http://localhost:3000/support/customers - Customer management

## 🎨 UI Components

Built with shadcn/ui components:

- `Badge` - Status indicators
- `Button` - Interactive elements
- `Card` - Content containers
- `Input` / `Textarea` - Form inputs
- `Table` - Data display
- `Tabs` - Navigation
- `ScrollArea` - Scrollable content

## 📱 Features

### Responsive Design
- Mobile-first approach
- Breakpoints: sm, md, lg, xl
- Touch-friendly interactions

### Real-time Updates
- Live metrics refresh
- Streaming chat responses
- Agent status indicators

### Performance
- Client-side data fetching
- Optimistic UI updates
- Lazy loading

### Accessibility
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Focus management

## 🔧 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **UI Components**: shadcn/ui
- **State Management**: React hooks
- **API Client**: Fetch API

## 📊 Sample Data Flow

### Support Chat Flow
```
1. User types question
   ↓
2. POST /support/chat { customerId, message }
   ↓
3. API: Triage agent routes to specialist
   ↓
4. Specialist agent processes with tools
   ↓
5. Response + metadata returned
   ↓
6. UI updates with result
```

### Metrics Flow
```
1. Page loads
   ↓
2. GET /support/metrics?range=7d
   ↓
3. API queries tickets table with SQL aggregations
   ↓
4. Returns: deflection rate, costs, volumes, categories
   ↓
5. UI renders charts and stats
```

## 🎬 Demo Scenarios

Try these in Support Chat:

1. **Password Reset** (Account agent)
   - "I forgot my password, how do I reset it?"

2. **Billing Question** (Billing agent)
   - "When is my next payment and how much will it be?"

3. **Small Refund** (Auto-approved)
   - "I was accidentally charged $25. Can I get a refund?"

4. **Large Refund** (HITL required)
   - "I need a refund of $200"

5. **Technical Question** (RAG search)
   - "What are the API rate limits on my plan?"

6. **Escalation** (Human required)
   - "This is ridiculous! I want a manager NOW!"

## 🐛 Troubleshooting

### API Connection Failed
- Ensure API is running on port 3001
- Check `http://localhost:3001/health`
- Verify CORS settings in API

### No Customers/Tickets Showing
- Run `./test-phase16.sh` to populate data
- Or manually create customers via API
- Check browser console for errors

### Metrics Not Loading
- Ensure database has data
- Check API logs for errors
- Verify metrics endpoint returns data

## 📝 Environment Variables

Create `.env.local`:

```bash
# API URL (default: http://localhost:3001)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 🚢 Deployment

### Build

```bash
pnpm build
```

### Production

```bash
pnpm start
```

### Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm build
CMD ["pnpm", "start"]
```

## 📚 Learn More

- [Phase 16 Complete Docs](/docs/PHASE_16_COMPLETE.md)
- [Phase 16 Demo Guide](/docs/PHASE_16_DEMO.md)
- [Phase 16 Quick Start](/docs/PHASE_16_QUICKSTART.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com)

---

**Built as part of Phase 16: Real-World AI Support System**

Demonstrates production-ready AI application development with multi-agent systems, RAG, HITL, memory, and observability.
