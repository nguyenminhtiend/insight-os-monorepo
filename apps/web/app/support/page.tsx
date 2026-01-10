'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  TrendingUp,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Bot,
  User
} from 'lucide-react';

interface SupportMetrics {
  summary: {
    totalTickets: number;
    resolved: number;
    escalated: number;
    open: number;
    pending: number;
    avgSatisfaction: number;
    avgResolutionMinutes: number;
    aiHandled: number;
    humanHandled: number;
    deflectionRate: number;
    costSavings: number;
  };
  topIssues: Array<{
    category: string;
    count: number;
    avg_satisfaction: number;
  }>;
  dailyVolume: Array<{
    date: string;
    count: number;
    resolved: number;
  }>;
}

export default function SupportDashboard() {
  const [metrics, setMetrics] = useState<SupportMetrics | null>(null);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, [range]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/support/metrics?range=${range}`);
      const data = await response.json();
      if (data.success) {
        setMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Tickets',
      value: metrics?.summary.totalTickets || 0,
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'AI Deflection Rate',
      value: `${metrics?.summary.deflectionRate.toFixed(1) || 0}%`,
      icon: Bot,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      subtitle: `${metrics?.summary.aiHandled || 0} handled by AI`
    },
    {
      title: 'Avg Resolution Time',
      value: `${metrics?.summary.avgResolutionMinutes.toFixed(1) || 0}m`,
      icon: Clock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Cost Savings',
      value: `$${metrics?.summary.costSavings || 0}`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
      subtitle: 'vs human-only support'
    },
    {
      title: 'Resolved',
      value: metrics?.summary.resolved || 0,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      subtitle: `${((metrics?.summary.resolved || 0) / (metrics?.summary.totalTickets || 1) * 100).toFixed(0)}% resolution rate`
    },
    {
      title: 'Escalated',
      value: metrics?.summary.escalated || 0,
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-500/10',
      subtitle: `${((metrics?.summary.escalated || 0) / (metrics?.summary.totalTickets || 1) * 100).toFixed(0)}% escalation rate`
    },
    {
      title: 'CSAT Score',
      value: metrics?.summary.avgSatisfaction.toFixed(1) || 'N/A',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      subtitle: 'Customer satisfaction'
    },
    {
      title: 'Human Required',
      value: metrics?.summary.humanHandled || 0,
      icon: User,
      color: 'text-gray-600',
      bgColor: 'bg-gray-500/10',
      subtitle: `${((metrics?.summary.humanHandled || 0) / (metrics?.summary.totalTickets || 1) * 100).toFixed(0)}% of tickets`
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading support metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">🎯 Support Dashboard</h1>
                <p className="text-sm text-muted-foreground">Real-time AI support performance</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              ● Live
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Range Selector */}
        <div className="flex justify-end mb-6">
          <div className="inline-flex rounded-lg border p-1">
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  range === r
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === '24h' ? 'Last 24h' : r === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <Card key={idx}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Issues */}
          <Card>
            <CardHeader>
              <CardTitle>Top Issue Categories</CardTitle>
              <CardDescription>Most common support requests</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics?.topIssues && metrics.topIssues.length > 0 ? (
                <div className="space-y-4">
                  {metrics.topIssues.map((issue, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 font-semibold text-sm">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium capitalize">{issue.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {issue.avg_satisfaction
                              ? `${issue.avg_satisfaction.toFixed(1)} avg satisfaction`
                              : 'No ratings yet'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{issue.count} tickets</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No issues tracked yet</p>
              )}
            </CardContent>
          </Card>

          {/* Daily Volume */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Ticket Volume</CardTitle>
              <CardDescription>Tickets created per day</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics?.dailyVolume && metrics.dailyVolume.length > 0 ? (
                <div className="space-y-3">
                  {metrics.dailyVolume.slice(0, 7).map((day, idx) => {
                    const resolvedPct = (day.resolved / day.count) * 100;
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {new Date(day.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {day.count} tickets ({day.resolved} resolved)
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full transition-all"
                            style={{ width: `${resolvedPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No daily data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
            <CardDescription>AI support system effectiveness</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* AI vs Human */}
              <div className="text-center">
                <div className="mb-4">
                  <div className="text-4xl font-bold text-blue-600">
                    {metrics?.summary.deflectionRate.toFixed(0)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">AI Deflection Rate</p>
                </div>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div>
                    <Bot className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                    <div className="font-semibold">{metrics?.summary.aiHandled}</div>
                    <div className="text-xs text-muted-foreground">AI Handled</div>
                  </div>
                  <div className="text-2xl text-muted-foreground">vs</div>
                  <div>
                    <User className="h-5 w-5 text-gray-600 mx-auto mb-1" />
                    <div className="font-semibold">{metrics?.summary.humanHandled}</div>
                    <div className="text-xs text-muted-foreground">Human</div>
                  </div>
                </div>
              </div>

              {/* Cost Analysis */}
              <div className="text-center border-l border-r">
                <div className="mb-4">
                  <div className="text-4xl font-bold text-emerald-600">
                    ${metrics?.summary.costSavings}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Total Cost Savings</p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between px-4">
                    <span className="text-muted-foreground">AI cost (@$2):</span>
                    <span className="font-medium">
                      ${(metrics?.summary.aiHandled || 0) * 2}
                    </span>
                  </div>
                  <div className="flex justify-between px-4">
                    <span className="text-muted-foreground">Human cost (@$7):</span>
                    <span className="font-medium">
                      ${(metrics?.summary.humanHandled || 0) * 7}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 pt-2 border-t">
                    <span className="text-muted-foreground">vs Human-only:</span>
                    <span className="font-semibold text-red-600">
                      ${(metrics?.summary.totalTickets || 0) * 7}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="text-center">
                <div className="mb-4">
                  <div className="text-4xl font-bold text-purple-600">
                    {metrics?.summary.avgResolutionMinutes.toFixed(1)}m
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Avg Resolution Time</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-4 text-sm">
                    <span className="text-muted-foreground">Satisfaction:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{metrics?.summary.avgSatisfaction.toFixed(1)}</span>
                      <span className="text-muted-foreground">/5.0</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 text-sm">
                    <span className="text-muted-foreground">Resolution rate:</span>
                    <span className="font-semibold">
                      {(
                        ((metrics?.summary.resolved || 0) / (metrics?.summary.totalTickets || 1)) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 text-sm">
                    <span className="text-muted-foreground">Escalation rate:</span>
                    <span className="font-semibold">
                      {(
                        ((metrics?.summary.escalated || 0) / (metrics?.summary.totalTickets || 1)) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="mt-8 flex gap-4">
          <Link href="/support/chat" className="flex-1">
            <Button className="w-full" size="lg">
              <MessageSquare className="mr-2 h-5 w-5" />
              Try Support Chat
            </Button>
          </Link>
          <Link href="/support/customers" className="flex-1">
            <Button variant="outline" className="w-full" size="lg">
              <Users className="mr-2 h-5 w-5" />
              View Customers
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
