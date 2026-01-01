'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Chat } from './components/Chat';

export default function Home() {
  const [health, setHealth] = useState<{
    status: string;
    version: string;
    uptime: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then((data) => setHealth(data.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 border-b">
        <h1 className="text-2xl font-bold">🧠 InsightOS</h1>
        <div className="text-sm">
          {error ? (
            <Badge variant="destructive">● Offline</Badge>
          ) : health ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              ● Online
            </Badge>
          ) : (
            <Badge variant="outline">● Connecting...</Badge>
          )}
        </div>
      </header>

      <main className="flex-1 p-8 max-w-4xl w-full mx-auto">
        <Chat />
      </main>

      <footer className="text-center py-4 border-t">
        <p className="text-sm text-green-600 dark:text-green-400">
          Phase 1: LLM Basics ✓ | Streaming Chat
        </p>
      </footer>
    </div>
  );
}
