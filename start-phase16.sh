#!/bin/bash

# Phase 16 - Complete Startup Guide
# Fixes all dependencies and starts the system

echo "🚀 Phase 16: Starting Real-World Support System"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the monorepo root"
    exit 1
fi

echo "📦 Step 1: Installing dependencies..."
pnpm install

echo ""
echo "🗄️  Step 2: Setting up database (if needed)..."
echo "Make sure PostgreSQL is running and migrations are applied:"
echo "  cd packages/db-schema && pnpm drizzle-kit push"
echo ""

read -p "Press Enter to continue once database is ready..."

echo ""
echo "🌱 Step 3: Creating demo data..."
# Create demo customer
curl -s -X POST http://localhost:3001/support/customers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo_customer",
    "email": "demo@example.com",
    "name": "Demo User",
    "plan": "pro"
  }' > /dev/null 2>&1

echo "✅ Demo customer created (or already exists)"

echo ""
echo "🎯 Step 4: Starting servers..."
echo ""
echo "You need to run these in separate terminals:"
echo ""
echo "Terminal 1 - API Server:"
echo "  cd apps/api && pnpm dev"
echo ""
echo "Terminal 2 - Web App:"
echo "  cd apps/web && pnpm dev"
echo ""
echo "Terminal 3 - Worker (optional):"
echo "  cd apps/worker && pnpm dev"
echo ""
echo "================================================"
echo "🎉 Ready to go!"
echo ""
echo "Visit: http://localhost:3000"
echo "  - /support - Dashboard"
echo "  - /support/chat - Chat interface"
echo "  - /support/customers - Customer management"
echo ""
echo "Or run the full test suite:"
echo "  ./test-phase16.sh"
echo ""
