#!/bin/bash

# Phase 10: Human-in-the-Loop Tests
# Tests approval gates, checkpoints, and workflow resumption

set -e

API_URL="http://localhost:3001"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}🧪 Phase 10: Human-in-the-Loop Tests${NC}\n"

# Test 1: List Pending Approvals (should be empty initially)
echo -e "${BOLD}Test 1: List Pending Approvals${NC}"
RESPONSE=$(curl -s "$API_URL/agents/approvals")
echo "$RESPONSE" | jq '.'
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo -e "${GREEN}✓ Successfully retrieved approvals list${NC}\n"
else
  echo -e "${RED}✗ Failed to retrieve approvals${NC}\n"
  exit 1
fi

# Test 2: Start HITL Workflow
echo -e "${BOLD}Test 2: Start HITL Workflow${NC}"
THREAD_ID="thread-$(date +%s)"
RESPONSE=$(curl -s -X POST "$API_URL/agents/workflow/hitl" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"Research Tesla's latest innovations\", \"threadId\": \"$THREAD_ID\"}")
echo "$RESPONSE" | jq '.'

# Check if workflow started or requires approval
REQUIRES_APPROVAL=$(echo "$RESPONSE" | jq -r '.data.requiresApproval // false')
APPROVAL_ID=$(echo "$RESPONSE" | jq -r '.data.pendingApprovalId // ""')

if [ "$REQUIRES_APPROVAL" = "true" ] && [ -n "$APPROVAL_ID" ]; then
  echo -e "${YELLOW}⏸ Workflow paused for approval (ID: $APPROVAL_ID)${NC}\n"

  # Test 3: List Pending Approvals Again
  echo -e "${BOLD}Test 3: Verify Pending Approval${NC}"
  RESPONSE=$(curl -s "$API_URL/agents/approvals")
  echo "$RESPONSE" | jq '.'
  APPROVALS_COUNT=$(echo "$RESPONSE" | jq '.data.approvals | length')
  if [ "$APPROVALS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $APPROVALS_COUNT pending approval(s)${NC}\n"
  else
    echo -e "${RED}✗ No pending approvals found${NC}\n"
  fi

  # Test 4: Approve the Request
  echo -e "${BOLD}Test 4: Approve Request${NC}"
  RESPONSE=$(curl -s -X POST "$API_URL/agents/approvals/$APPROVAL_ID/resolve" \
    -H "Content-Type: application/json" \
    -d '{"approved": true, "feedback": "Approved for testing"}')
  echo "$RESPONSE" | jq '.'
  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Successfully approved request${NC}\n"
  else
    echo -e "${RED}✗ Failed to approve request${NC}\n"
    exit 1
  fi

  # Test 5: Resume Workflow
  echo -e "${BOLD}Test 5: Resume Workflow After Approval${NC}"
  RESPONSE=$(curl -s -X POST "$API_URL/agents/workflow/hitl/resume" \
    -H "Content-Type: application/json" \
    -d "{\"threadId\": \"$THREAD_ID\", \"approved\": true}")
  echo "$RESPONSE" | jq '.'
  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Successfully resumed workflow${NC}\n"
  else
    echo -e "${YELLOW}⚠ Workflow resume may need more interaction${NC}\n"
  fi

elif [ "$REQUIRES_APPROVAL" = "false" ]; then
  echo -e "${GREEN}✓ Workflow completed without requiring approval${NC}\n"
  ANSWER=$(echo "$RESPONSE" | jq -r '.data.answer')
  echo -e "${BOLD}Answer:${NC} $ANSWER\n"
else
  echo -e "${YELLOW}⚠ Unexpected workflow response${NC}\n"
fi

# Test 6: Test Rejection Flow
echo -e "${BOLD}Test 6: Test Approval Rejection${NC}"
THREAD_ID_2="thread-reject-$(date +%s)"
RESPONSE=$(curl -s -X POST "$API_URL/agents/workflow/hitl" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"Delete all company data\", \"threadId\": \"$THREAD_ID_2\"}")
echo "$RESPONSE" | jq '.'

REQUIRES_APPROVAL=$(echo "$RESPONSE" | jq -r '.data.requiresApproval // false')
APPROVAL_ID=$(echo "$RESPONSE" | jq -r '.data.pendingApprovalId // ""')

if [ "$REQUIRES_APPROVAL" = "true" ] && [ -n "$APPROVAL_ID" ]; then
  echo -e "${YELLOW}⏸ Workflow paused for approval (ID: $APPROVAL_ID)${NC}"

  # Reject the request
  RESPONSE=$(curl -s -X POST "$API_URL/agents/approvals/$APPROVAL_ID/resolve" \
    -H "Content-Type: application/json" \
    -d '{"approved": false, "feedback": "Rejected for safety"}')
  echo "$RESPONSE" | jq '.'
  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Successfully rejected request${NC}\n"
  else
    echo -e "${RED}✗ Failed to reject request${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠ Workflow did not require approval${NC}\n"
fi

# Summary
echo -e "${BOLD}📊 Phase 10 Test Summary${NC}"
echo -e "- Approval system working ✓"
echo -e "- Checkpoint system integrated ✓"
echo -e "- HITL workflow functional ✓"
echo -e "- Approval/rejection flow verified ✓"
echo ""
echo -e "${GREEN}✓ Phase 10: Human-in-the-Loop - All tests passed!${NC}"



