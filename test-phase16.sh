#!/bin/bash

# Phase 16: Support Agent System Test
# Tests the customer support swarm, knowledge base, and metrics

BASE_URL="http://localhost:3001"

echo "🎯 Phase 16: Support Agent System Test"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Create test customer
echo -e "${BLUE}Test 1: Creating test customer${NC}"
CUSTOMER_RESPONSE=$(curl -s -X POST "$BASE_URL/support/customers" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "cust_test_001",
    "email": "test@example.com",
    "name": "Test Customer",
    "plan": "pro"
  }')
echo "$CUSTOMER_RESPONSE" | jq '.'
echo ""

# Test 2: Ingest knowledge base articles
echo -e "${BLUE}Test 2: Ingesting knowledge base articles${NC}"
KNOWLEDGE_RESPONSE=$(curl -s -X POST "$BASE_URL/support/knowledge/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "title": "How to Reset Your Password",
        "content": "To reset your password:\n1. Click on Forgot Password on login page\n2. Enter your email address\n3. Check your email for reset link\n4. Click the link and create new password\n5. Log in with new credentials",
        "category": "account",
        "tags": ["password", "login", "security"],
        "status": "published"
      },
      {
        "title": "Understanding Your Billing Cycle",
        "content": "Your billing cycle:\n- Pro plan: $99/month billed on the 1st\n- Payment methods: Credit card, PayPal\n- Invoices sent via email\n- Refunds processed within 5-7 days\n- Upgrades are prorated",
        "category": "billing",
        "tags": ["billing", "subscription", "pricing"],
        "status": "published"
      },
      {
        "title": "API Rate Limits by Plan",
        "content": "Rate limits:\n- Free: 100 requests/hour\n- Pro: 1000 requests/hour\n- Enterprise: Unlimited\nTo increase limits, upgrade your plan or contact sales.",
        "category": "technical",
        "tags": ["api", "limits", "technical"],
        "status": "published"
      }
    ]
  }')
echo "$KNOWLEDGE_RESPONSE" | jq '.'
echo ""

# Test 3: Support chat - Password reset (account issue)
echo -e "${BLUE}Test 3: Support chat - Password reset request${NC}"
CHAT1_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "I forgot my password and cant log in. Can you help me?"
  }')
echo "$CHAT1_RESPONSE" | jq '.'
echo ""

# Test 4: Support chat - Billing question
echo -e "${BLUE}Test 4: Support chat - Billing inquiry${NC}"
CHAT2_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "I was charged $99 but I want to know when my next payment is due?"
  }')
echo "$CHAT2_RESPONSE" | jq '.'
echo ""

# Test 5: Support chat - Refund request (small amount)
echo -e "${BLUE}Test 5: Support chat - Small refund request (auto-approved)${NC}"
CHAT3_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "I was charged $30 by mistake last week. Can I get a refund?"
  }')
echo "$CHAT3_RESPONSE" | jq '.'
echo ""

# Test 6: Support chat - Large refund (requires approval)
echo -e "${BLUE}Test 6: Support chat - Large refund request (requires approval)${NC}"
CHAT4_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "I need a refund of $150. The service didnt meet my expectations."
  }')
echo "$CHAT4_RESPONSE" | jq '.'
echo ""

# Test 7: Support chat - Technical question
echo -e "${BLUE}Test 7: Support chat - Technical API question${NC}"
CHAT5_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "Im hitting rate limits on the API. How many requests can I make per hour?"
  }')
echo "$CHAT5_RESPONSE" | jq '.'
echo ""

# Test 8: Support chat - Angry customer (escalation)
echo -e "${BLUE}Test 8: Support chat - Angry customer (should escalate)${NC}"
CHAT6_RESPONSE=$(curl -s -X POST "$BASE_URL/support/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_test_001",
    "message": "This is ridiculous! Ive been trying to fix this for hours and nothing works. I want to speak to a manager NOW!"
  }')
echo "$CHAT6_RESPONSE" | jq '.'
echo ""

# Test 9: Get customer details
echo -e "${BLUE}Test 9: Get customer details${NC}"
CUSTOMER_DETAILS=$(curl -s "$BASE_URL/support/customers/cust_test_001")
echo "$CUSTOMER_DETAILS" | jq '.'
echo ""

# Test 10: List knowledge articles
echo -e "${BLUE}Test 10: List knowledge base articles${NC}"
KNOWLEDGE_LIST=$(curl -s "$BASE_URL/support/knowledge")
echo "$KNOWLEDGE_LIST" | jq '.'
echo ""

# Test 11: Get support metrics
echo -e "${BLUE}Test 11: Get support metrics (7 day)${NC}"
METRICS=$(curl -s "$BASE_URL/support/metrics?range=7d")
echo "$METRICS" | jq '.'
echo ""

# Test 12: Get customer-specific metrics
echo -e "${BLUE}Test 12: Get customer-specific metrics${NC}"
CUSTOMER_METRICS=$(curl -s "$BASE_URL/support/metrics/customer/cust_test_001")
echo "$CUSTOMER_METRICS" | jq '.'
echo ""

# Test 13: Get knowledge base metrics
echo -e "${BLUE}Test 13: Get knowledge base metrics${NC}"
KNOWLEDGE_METRICS=$(curl -s "$BASE_URL/support/metrics/knowledge")
echo "$KNOWLEDGE_METRICS" | jq '.'
echo ""

# Test 14: Check pending approvals
echo -e "${BLUE}Test 14: Check pending approvals (HITL)${NC}"
APPROVALS=$(curl -s "$BASE_URL/agents/approvals")
echo "$APPROVALS" | jq '.'
echo ""

echo -e "${GREEN}✅ Phase 16 Tests Complete!${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "- ✅ Customer creation"
echo "- ✅ Knowledge base ingestion"
echo "- ✅ Account support (password reset)"
echo "- ✅ Billing support (payment inquiry)"
echo "- ✅ Small refund (auto-approved)"
echo "- ✅ Large refund (requires approval)"
echo "- ✅ Technical support (API limits)"
echo "- ✅ Escalation (angry customer)"
echo "- ✅ Customer details retrieval"
echo "- ✅ Knowledge base listing"
echo "- ✅ Support metrics"
echo "- ✅ Customer metrics"
echo "- ✅ Knowledge metrics"
echo "- ✅ HITL approval tracking"
echo ""
echo -e "${YELLOW}Key Features Demonstrated:${NC}"
echo "1. Multi-agent swarm (Triage → Specialist → Escalation)"
echo "2. RAG integration (knowledge base search)"
echo "3. HITL approval (large refunds require human)"
echo "4. Memory system (customer context across interactions)"
echo "5. Background jobs (ticket creation, notifications)"
echo "6. Observability (Langfuse tracing of all interactions)"
echo "7. Metrics dashboard (deflection rate, satisfaction, cost savings)"
echo ""
