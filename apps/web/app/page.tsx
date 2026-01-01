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
        <h1 className="text-4xl font-bold text-white text-center mb-2">
          🧠 InsightOS
        </h1>
        <p className="text-slate-400 text-center mb-6">
          Strategic Market Intelligence Platform
        </p>

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
              <span className="text-green-400 font-semibold">
                {health.status} ✅
              </span>
            </div>
            <div className="flex justify-between p-3 bg-slate-900 rounded-lg">
              <span className="text-slate-400">Version:</span>
              <span className="text-green-400 font-semibold">
                {health.version}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-slate-900 rounded-lg">
              <span className="text-slate-400">Uptime:</span>
              <span className="text-green-400 font-semibold">
                {health.uptime}s
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900 rounded-lg text-slate-400 text-center">
            Loading...
          </div>
        )}

        <div className="h-px bg-slate-800 my-6" />

        <div className="text-center text-green-400 text-sm">
          <p>Phase 0: Monorepo Bootstrap ✓</p>
        </div>
      </div>
    </main>
  );
}
