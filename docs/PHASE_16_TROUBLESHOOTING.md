# Phase 16 - Troubleshooting Guide

## Common Issues & Solutions

### ❌ Error: Cannot find package '@insight-os/jobs'

**Cause:** Missing dependency in ai-engine package

**Fix:**
```bash
# Already fixed! The dependency was added to packages/ai-engine/package.json
pnpm install
```

---

### ❌ Error: Package subpath './support' is not defined

**Cause:** Support module not exported from ai-engine

**Fix:**
```bash
# Already fixed! Added to packages/ai-engine/package.json exports
# Restart your dev servers
```

---

### ❌ Web Error: Failed to fetch from localhost:3001

**Cause:** API server is not running

**Fix:**
```bash
# Start API first in a separate terminal
cd apps/api && pnpm dev

# Wait for "🚀 InsightOS API running on http://localhost:3001"
# Then start web app in another terminal
cd apps/web && pnpm dev
```

---

### ❌ Error: react-markdown or remark-gfm not found

**Cause:** Missing web dependencies

**Fix:**
```bash
# Already fixed! Dependencies were installed
cd apps/web
pnpm install
```

---

### ❌ Database Connection Error

**Cause:** PostgreSQL not running or not configured

**Fix:**
```bash
# 1. Start PostgreSQL
brew services start postgresql@15  # macOS
# or
sudo service postgresql start      # Linux

# 2. Create database (if needed)
createdb insightos

# 3. Run migrations
cd packages/db-schema
pnpm drizzle-kit push

# 4. Update .env with your DATABASE_URL
DATABASE_URL=postgresql://user:pass@localhost:5432/insightos
```

---

### ❌ No Data Showing in Dashboard

**Cause:** Database is empty

**Fix:**
```bash
# Run the test script to populate sample data
./test-phase16.sh

# Or manually create data via API
curl -X POST http://localhost:3001/support/customers \
  -H "Content-Type: application/json" \
  -d '{"id":"test","email":"test@example.com","name":"Test","plan":"pro"}'
```

---

### ❌ Port 3001 Already in Use

**Cause:** Another process using the API port

**Fix:**
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9

# Or change the port in apps/api/.env
API_PORT=3002
```

---

### ❌ TypeScript Errors

**Cause:** Type mismatches or missing types

**Fix:**
```bash
# Rebuild all packages
pnpm build

# Check for errors
pnpm lint
```

---

## ✅ Verification Steps

### 1. Check API Health
```bash
curl http://localhost:3001/health

# Expected:
# {"success":true,"data":{"status":"ok","version":"0.1.0",...}}
```

### 2. Check Web App
```bash
open http://localhost:3000

# Should see:
# - Home page with Phase 16 features
# - Green "Online" badge in header
```

### 3. Test Support Chat
```bash
# Navigate to: http://localhost:3000/support/chat
# Try quick query: "I forgot my password"
# Expected: Response from Account agent
```

### 4. Check Database Connection
```bash
# From API logs, should see:
# "[Database] Connected to PostgreSQL"
# "[Redis] Connected"
```

---

## 🔧 Clean Restart

If all else fails, do a complete restart:

```bash
# 1. Stop all servers (Ctrl+C in each terminal)

# 2. Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install

# 3. Restart PostgreSQL and Redis
brew services restart postgresql@15
brew services restart redis

# 4. Reset database (CAUTION: Deletes all data!)
cd packages/db-schema
pnpm drizzle-kit drop  # Optional: only if you want to start fresh
pnpm drizzle-kit push

# 5. Start servers
# Terminal 1:
cd apps/api && pnpm dev

# Terminal 2:
cd apps/web && pnpm dev

# 6. Populate test data
./test-phase16.sh
```

---

## 📞 Still Having Issues?

### Check Dependencies
```bash
# Node version (need 22+)
node --version

# pnpm version (need 9+)
pnpm --version

# PostgreSQL (need 15+)
psql --version

# Redis (need 7+)
redis-cli --version
```

### View Logs
```bash
# API logs - check for errors
cd apps/api && pnpm dev

# Web logs - check for network errors
cd apps/web && pnpm dev

# Browser console - check for fetch errors
# Open DevTools (F12) > Console tab
```

### Check .env Files
```bash
# apps/api/.env should have:
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...

# apps/web/.env.local should have:
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 🎯 Quick Reference

**Start Order:**
1. PostgreSQL & Redis (background services)
2. API server (apps/api)
3. Web app (apps/web)
4. Worker (optional, apps/worker)

**URLs:**
- API: http://localhost:3001
- Web: http://localhost:3000
- API Health: http://localhost:3001/health

**Test:**
```bash
./test-phase16.sh
```

**Docs:**
- Full docs: docs/PHASE_16_COMPLETE.md
- Quick start: docs/PHASE_16_QUICKSTART.md
- Web demo: docs/PHASE_16_WEB_DEMO.md

---

**All issues should now be resolved! 🎉**
