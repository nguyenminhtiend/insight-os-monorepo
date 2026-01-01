# Phase 0: Monorepo Bootstrap

> **Goal:** Set up the foundational monorepo structure with TurboRepo, pnpm workspaces, and scaffold the core apps (Hono API + TanStack Start frontend).

---

## Prerequisites

- [mise](https://mise.jdx.dev/) - Dev tool version manager
- Node.js 24.12.0 (managed by mise)
- pnpm 10.26.2 (managed by mise)
- PostgreSQL v18 (installed locally)
- Basic TypeScript knowledge

### Setting Up mise

**Install mise:**

```bash
# macOS
curl https://mise.run | sh

# OR using Homebrew
brew install mise
```

**Activate mise:**

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
eval "$(mise activate zsh)"  # or bash/fish
```

**Install project tools:**

```bash
# In the project root directory
mise install
```

This will automatically install Node.js 24.12.0 and pnpm 10.26.2 as specified in `.mise.toml`.

---

## Tech Stack for This Phase

| Tool           | Purpose                                |
| -------------- | -------------------------------------- |
| TurboRepo      | Monorepo build orchestration & caching |
| pnpm           | Package manager with workspaces        |
| Hono           | Backend API framework                  |
| TanStack Start | Frontend framework                     |
| TypeScript     | Type safety across all packages        |

---

## Directory Structure

```
/insight-os-monorepo
├── apps/
│   ├── api/                    # Hono API server
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   └── routes/
│   │   │       └── health.ts   # Health check route
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # TanStack Start frontend
│       ├── app/
│       │   ├── routes/
│       │   │   └── index.tsx   # Home page
│       │   ├── client.tsx
│       │   ├── router.tsx
│       │   └── routeTree.gen.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                 # Shared types & utilities
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json                  # TurboRepo config
├── pnpm-workspace.yaml         # pnpm workspaces config
├── package.json                # Root package.json
└── tsconfig.base.json          # Shared TypeScript config
```

---

## Implementation Steps

### Step 1: Initialize Monorepo Root

**1.1 Create `.mise.toml`:**

```toml
[tools]
node = "24.12.0"
pnpm = "10.26.2"

[env]
# PostgreSQL v18 (installed locally)
POSTGRES_VERSION = "18"
```

**1.2 Create root `package.json`:**

```json
{
  "name": "insight-os-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "latest"
  },
  "engines": {
    "node": ">=24.12.0"
  }
}
```

**1.3 Create `pnpm-workspace.yaml`:**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**1.4 Create `turbo.json`:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".output/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**1.5 Create `tsconfig.base.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

### Step 2: Create Shared Package

**2.1 Create `packages/shared/package.json`:**

```json
{
  "name": "@insight-os/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "latest"
  }
}
```

**2.2 Create `packages/shared/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**2.3 Create `packages/shared/src/index.ts`:**

```typescript
// Shared types for InsightOS

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
}

export const createResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});

export const createErrorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
  timestamp: new Date().toISOString(),
});
```

---

### Step 3: Create Hono API Server

**3.1 Create `apps/api/package.json`:**

```json
{
  "name": "@insight-os/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "latest",
    "hono": "latest",
    "@insight-os/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

**3.2 Create `apps/api/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**3.3 Create `apps/api/src/index.ts`:**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Routes
app.route('/health', healthRoutes);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'InsightOS API',
    version: '0.0.1',
    docs: '/health',
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.log(`🚀 InsightOS API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
```

**3.4 Create `apps/api/src/routes/health.ts`:**

```typescript
import { Hono } from 'hono';
import { createResponse, type HealthStatus } from '@insight-os/shared';

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  const health: HealthStatus = {
    status: 'healthy',
    version: '0.0.1',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  return c.json(createResponse(health));
});

healthRoutes.get('/ready', (c) => {
  // Future: Check database connections, etc.
  return c.json(createResponse({ ready: true }));
});

healthRoutes.get('/live', (c) => {
  return c.json(createResponse({ live: true }));
});
```

---

### Step 4: Create TanStack Start Frontend

**4.1 Create `apps/web/package.json`:**

```json
{
  "name": "@insight-os/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vinxi dev --port 3000",
    "build": "vinxi build",
    "start": "vinxi start",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-router": "latest",
    "@tanstack/start": "latest",
    "react": "latest",
    "react-dom": "latest",
    "vinxi": "latest",
    "@insight-os/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "tailwindcss": "latest",
    "@tailwindcss/vite": "latest"
  }
}
```

**4.2 Create `apps/web/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "moduleDetection": "force",
    "noEmit": true
  },
  "include": ["app/**/*", "*.config.ts"]
}
```

**4.3 Create `apps/web/app.config.ts`:**

```typescript
import { defineConfig } from '@tanstack/start/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    preset: 'node-server',
  },
});
```

**4.4 Create `apps/web/app/client.tsx`:**

```tsx
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/start';
import { createRouter } from './router';

const router = createRouter();

hydrateRoot(document, <StartClient router={router} />);
```

**4.5 Create `apps/web/app/ssr.tsx`:**

```tsx
import { createStartHandler, defaultStreamHandler } from '@tanstack/start/server';
import { getRouterManifest } from '@tanstack/start/router-manifest';
import { createRouter } from './router';

export default createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler);
```

**4.6 Create `apps/web/app/router.tsx`:**

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

**4.7 Create `apps/web/app/routes/__root.tsx`:**

```tsx
import { Outlet, ScrollRestoration, createRootRoute } from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/start';
import type { ReactNode } from 'react';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'InsightOS' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

**4.8 Create `apps/web/app/routes/index.tsx`:**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';

export const Route = createFileRoute('/')({
  component: Home
});

function Home() {
  const [health, setHealth] = useState<{
    status: string;
    version: string;
    uptime: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then((data) => setHealth(data.data));
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🧠 InsightOS</h1>
        <p style={styles.subtitle}>Strategic Market Intelligence Platform</p>

        <div style={styles.divider} />

        <h2 style={styles.sectionTitle}>API Status</h2>
        {error ? (
          <div style={styles.error}>❌ API Offline: {error}</div>
        ) : health ? (
          <div style={styles.status}>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>Status:</span>
              <span style={styles.statusValue}>{health.status} ✅</span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>Version:</span>
              <span style={styles.statusValue}>{health.version}</span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>Uptime:</span>
              <span style={styles.statusValue}>{health.uptime}s</span>
            </div>
          </div>
        ) : (
          <div style={styles.loading}>Loading...</div>
        )}

        <div style={styles.divider} />

        <div style={styles.footer}>
          <p>Phase 0: Monorepo Bootstrap ✓</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  card: {
    background: '#0f0f23',
    borderRadius: '16px',
    padding: '48px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    border: '1px solid #333',
    maxWidth: '480px',
    width: '90%'
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: '1rem',
    color: '#888',
    margin: '8px 0 0 0',
    textAlign: 'center'
  },
  divider: {
    height: '1px',
    background: '#333',
    margin: '24px 0'
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#888',
    margin: '0 0 16px 0',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  statusItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#1a1a3e',
    borderRadius: '8px'
  },
  statusLabel: {
    color: '#888'
  },
  statusValue: {
    color: '#4ade80',
    fontWeight: 600
  },
  error: {
    padding: '16px',
    background: '#2d1f1f',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#fca5a5'
  },
  loading: {
    padding: '16px',
    background: '#1a1a3e',
    borderRadius: '8px',
    color: '#888',
    textAlign: 'center'
  },
  footer: {
    textAlign: 'center',
    color: '#4ade80',
    fontSize: '0.875rem'
  }
};
```

---

## Running the Project

```bash
# Ensure mise is activated and tools are installed
mise install

# Install dependencies (fresh, latest versions)
pnpm install

# Run both apps in development
pnpm dev
```

- API: http://localhost:3001
- Web: http://localhost:3000

---

## Demo Checklist

- [ ] API health endpoint returns JSON response
- [ ] Frontend loads and displays API status
- [ ] Hot reload works for both apps
- [ ] Shared types work across packages
- [ ] TurboRepo caching works on rebuild

---

## What's Next

**Phase 1: LLM Basics** will add:

- Vercel AI SDK integration
- Chat endpoint with streaming
- Basic chat UI component

---

## Troubleshooting

### Issue: Module not found `@insight-os/shared`

**Solution:** Run `pnpm install` from root to link workspaces.

### Issue: Port already in use

**Solution:** Kill existing processes or change ports in respective configs.

### Issue: TanStack Start route generation

**Solution:** Routes are auto-generated. If missing, restart dev server.
