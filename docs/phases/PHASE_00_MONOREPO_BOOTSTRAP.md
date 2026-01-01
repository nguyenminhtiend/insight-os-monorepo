# Phase 0: Monorepo Bootstrap

> **Goal:** Set up the foundational monorepo structure with TurboRepo, pnpm workspaces, and scaffold the core apps (Hono API + Next.js frontend).

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

| Tool       | Purpose                                |
| ---------- | -------------------------------------- |
| TurboRepo  | Monorepo build orchestration & caching |
| pnpm       | Package manager with workspaces        |
| Hono       | Backend API framework                  |
| Next.js    | React framework with App Router        |
| TypeScript | Type safety across all packages        |

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
│   └── web/                    # Next.js frontend
│       ├── app/
│       │   ├── layout.tsx      # Root layout
│       │   └── page.tsx        # Home page
│       ├── next.config.ts
│       ├── tailwind.config.ts
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
      "outputs": ["dist/**", ".next/**"]
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

### Step 4: Create Next.js Frontend

**4.1 Create `apps/web/package.json`:**

```json
{
  "name": "@insight-os/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "@insight-os/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "typescript": "latest",
    "tailwindcss": "latest",
    "postcss": "latest",
    "autoprefixer": "latest"
  }
}
```

**4.2 Create `apps/web/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "noEmit": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./app/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**4.3 Create `apps/web/next.config.ts`:**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@insight-os/shared'],
};

export default config;
```

**4.4 Create `apps/web/tailwind.config.ts`:**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

**4.5 Create `apps/web/postcss.config.mjs`:**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**4.6 Create `apps/web/app/globals.css`:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**4.7 Create `apps/web/app/layout.tsx`:**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InsightOS',
  description: 'Strategic Market Intelligence Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**4.8 Create `apps/web/app/page.tsx`:**

```tsx
'use client';

import { useState, useEffect } from 'react';

interface HealthData {
  status: string;
  version: string;
  uptime: number;
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then((data) => setHealth(data.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-slate-950 rounded-2xl p-12 shadow-2xl border border-slate-800 max-w-md w-11/12">
        <h1 className="text-4xl font-bold text-white text-center mb-2">🧠 InsightOS</h1>
        <p className="text-slate-400 text-center mb-6">Strategic Market Intelligence Platform</p>

        <div className="h-px bg-slate-800 my-6" />

        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          API Status
        </h2>

        {error ? (
          <div className="p-4 bg-red-950 border border-red-500 rounded-lg text-red-200">
            ❌ API Offline: {error}
          </div>
        ) : health ? (
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-slate-900 rounded-lg">
              <span className="text-slate-400">Status:</span>
              <span className="text-green-400 font-semibold">{health.status} ✅</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-900 rounded-lg">
              <span className="text-slate-400">Version:</span>
              <span className="text-green-400 font-semibold">{health.version}</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-900 rounded-lg">
              <span className="text-slate-400">Uptime:</span>
              <span className="text-green-400 font-semibold">{health.uptime}s</span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900 rounded-lg text-slate-400 text-center">Loading...</div>
        )}

        <div className="h-px bg-slate-800 my-6" />

        <div className="text-center text-green-400 text-sm">
          <p>Phase 0: Monorepo Bootstrap ✓</p>
        </div>
      </div>
    </main>
  );
}
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

### Issue: Next.js build errors

**Solution:** Clear `.next` folder and rebuild: `rm -rf .next && pnpm dev`
