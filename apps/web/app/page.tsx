'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chat } from './components/Chat';
import {
  MessageSquare,
  BarChart3,
  Users,
  Bot,
  ArrowRight,
  Sparkles
} from 'lucide-react';

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

  const features = [
    {
      icon: MessageSquare,
      title: 'Support Chat',
      description: 'AI-powered customer support with multi-agent routing',
      href: '/support/chat',
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10'
    },
    {
      icon: BarChart3,
      title: 'Support Dashboard',
      description: 'Real-time metrics, deflection rates, and cost savings',
      href: '/support',
      color: 'text-green-600',
      bgColor: 'bg-green-500/10'
    },
    {
      icon: Users,
      title: 'Customers',
      description: 'Manage customer accounts and support history',
      href: '/support/customers',
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 border-b">
        <h1 className="text-2xl font-bold">🧠 InsightOS</h1>
        <div className="text-sm">
          {error ? (
            <Badge variant="destructive">● Offline</Badge>
          ) : health ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              ● Online {health.version && `• v${health.version}`}
            </Badge>
          ) : (
            <Badge variant="outline">● Connecting...</Badge>
          )}
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 py-8">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              Phase 16: Real-World AI Support System
            </div>
            <h2 className="text-4xl font-bold tracking-tight">
              Production-Ready AI Customer Support
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Multi-agent swarm with RAG, HITL approvals, memory, and full observability.
              See real business value in action.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Link key={idx} href={feature.href}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                        <Icon className={`h-6 w-6 ${feature.color}`} />
                      </div>
                      <CardTitle className="flex items-center justify-between">
                        {feature.title}
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </CardTitle>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Key Features */}
          <Card>
            <CardHeader>
              <CardTitle>What's Built</CardTitle>
              <CardDescription>Complete production-ready AI support infrastructure</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: '🤖', text: '5 Specialized AI agents (Triage, Technical, Billing, Account, Escalation)' },
                  { icon: '🔍', text: 'RAG knowledge base search with semantic caching' },
                  { icon: '✋', text: 'HITL approval gates (refunds >$50, escalations)' },
                  { icon: '🧠', text: 'Customer memory & context across interactions' },
                  { icon: '📊', text: 'Real-time metrics: deflection rate, CSAT, cost savings' },
                  { icon: '⚡', text: 'Background jobs for tickets & notifications' },
                  { icon: '👁️', text: 'Full Langfuse observability & tracing' },
                  { icon: '💰', text: '70%+ AI deflection = $135K/year savings' }
                ].map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm">
                    <span className="text-2xl">{feature.icon}</span>
                    <span className="pt-1">{feature.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Start */}
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Try the support system right now</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Link href="/support/chat" className="flex-1">
                  <Button size="lg" className="w-full">
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Try Support Chat
                  </Button>
                </Link>
                <Link href="/support" className="flex-1">
                  <Button size="lg" variant="outline" className="w-full">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    View Dashboard
                  </Button>
                </Link>
              </div>
              <div className="text-sm text-muted-foreground text-center">
                Ask about password resets, billing, refunds, or API limits. Watch the multi-agent system in action.
              </div>
            </CardContent>
          </Card>

          {/* Original Chat */}
          <Card>
            <CardHeader>
              <CardTitle>Legacy Chat (Phase 1)</CardTitle>
              <CardDescription>Original streaming chat implementation</CardDescription>
            </CardHeader>
            <CardContent>
              <Chat />
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="text-center py-4 border-t">
        <p className="text-sm text-green-600 dark:text-green-400">
          Phase 16: Real-World AI Support ✓ | Production-Ready Features
        </p>
      </footer>
    </div>
  );
}
