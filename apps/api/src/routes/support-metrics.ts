import { Hono } from 'hono';
import { createResponse, createErrorResponse } from '@insight-os/shared';
import { db } from '../db/index.js';
import { tickets, customers, knowledgeArticles } from '@insight-os/db-schema';
import { sql, eq, and, gte } from 'drizzle-orm';

export const supportMetricsRoutes = new Hono();

/**
 * GET /support/metrics
 * Get support performance metrics
 */
supportMetricsRoutes.get('/', async (c) => {
  try {
    const range = c.req.query('range') || '7d';

    // Parse range to PostgreSQL interval
    const intervalMap: Record<string, string> = {
      '24h': '1 day',
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days'
    };

    const interval = intervalMap[range] || '7 days';

    // Overall ticket metrics
    const ticketMetrics = await db.execute(sql`
      SELECT
        COUNT(*)::int as total_tickets,
        COUNT(*) FILTER (WHERE status = 'resolved')::int as resolved,
        COUNT(*) FILTER (WHERE status = 'escalated')::int as escalated,
        COUNT(*) FILTER (WHERE status = 'open')::int as open,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        AVG(satisfaction_score)::float as avg_satisfaction,
        AVG(
          CASE
            WHEN resolved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (resolved_at - created_at))/60
          END
        )::float as avg_resolution_minutes,
        COUNT(*) FILTER (WHERE assigned_to LIKE 'ai_%')::int as ai_handled,
        COUNT(*) FILTER (WHERE assigned_to = 'human' OR assigned_to NOT LIKE 'ai_%')::int as human_handled
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '${sql.raw(interval)}'
    `);

    const metrics = ticketMetrics[0] || {
      total_tickets: 0,
      resolved: 0,
      escalated: 0,
      open: 0,
      pending: 0,
      avg_satisfaction: 0,
      avg_resolution_minutes: 0,
      ai_handled: 0,
      human_handled: 0
    };

    // Calculate AI deflection rate
    const deflectionRate =
      metrics.total_tickets > 0 ? (metrics.ai_handled / metrics.total_tickets) * 100 : 0;

    // Top issue categories
    const topIssues = await db.execute(sql`
      SELECT
        category,
        COUNT(*)::int as count,
        AVG(satisfaction_score)::float as avg_satisfaction
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '${sql.raw(interval)}'
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `);

    // Daily ticket volume (last 7 days)
    const dailyVolume = await db.execute(sql`
      SELECT
        DATE(created_at) as date,
        COUNT(*)::int as count,
        COUNT(*) FILTER (WHERE status = 'resolved')::int as resolved
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Average response time by category
    const responseTimeByCategory = await db.execute(sql`
      SELECT
        category,
        AVG(
          CASE
            WHEN resolved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (resolved_at - created_at))/60
          END
        )::float as avg_minutes
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '${sql.raw(interval)}'
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY avg_minutes ASC
    `);

    // Customer satisfaction trends
    const satisfactionTrend = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', created_at) as date,
        AVG(satisfaction_score)::float as avg_score,
        COUNT(*)::int as count
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '${sql.raw(interval)}'
        AND satisfaction_score IS NOT NULL
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `);

    // Cost savings calculation
    // Assume: $5 per ticket deflected from human agents
    const costSavings = metrics.ai_handled * 5;

    // Agent performance
    const agentPerformance = await db.execute(sql`
      SELECT
        assigned_to as agent,
        COUNT(*)::int as tickets_handled,
        AVG(satisfaction_score)::float as avg_satisfaction,
        COUNT(*) FILTER (WHERE status = 'resolved')::int as resolved_count
      FROM tickets
      WHERE created_at > NOW() - INTERVAL '${sql.raw(interval)}'
        AND assigned_to IS NOT NULL
      GROUP BY assigned_to
      ORDER BY tickets_handled DESC
      LIMIT 10
    `);

    return c.json(
      createResponse({
        range,
        summary: {
          totalTickets: metrics.total_tickets,
          resolved: metrics.resolved,
          escalated: metrics.escalated,
          open: metrics.open,
          pending: metrics.pending,
          avgSatisfaction: Math.round((metrics.avg_satisfaction || 0) * 10) / 10,
          avgResolutionMinutes: Math.round((metrics.avg_resolution_minutes || 0) * 10) / 10,
          aiHandled: metrics.ai_handled,
          humanHandled: metrics.human_handled,
          deflectionRate: Math.round(deflectionRate * 10) / 10,
          costSavings
        },
        topIssues,
        dailyVolume,
        responseTimeByCategory,
        satisfactionTrend,
        agentPerformance
      })
    );
  } catch (error) {
    console.error('[Support] Metrics error:', error);
    return c.json(createErrorResponse('Failed to get metrics'), 500);
  }
});

/**
 * GET /support/metrics/customer/:customerId
 * Get metrics for specific customer
 */
supportMetricsRoutes.get('/customer/:customerId', async (c) => {
  try {
    const customerId = c.req.param('customerId');

    // Customer metrics
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);

    if (!customer) {
      return c.json(createErrorResponse('Customer not found'), 404);
    }

    // Ticket breakdown
    const ticketBreakdown = await db.execute(sql`
      SELECT
        status,
        COUNT(*)::int as count
      FROM tickets
      WHERE customer_id = ${customerId}
      GROUP BY status
    `);

    // Category breakdown
    const categoryBreakdown = await db.execute(sql`
      SELECT
        category,
        COUNT(*)::int as count,
        AVG(satisfaction_score)::float as avg_satisfaction
      FROM tickets
      WHERE customer_id = ${customerId}
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);

    // Recent interactions
    const recentTickets = await db.execute(sql`
      SELECT
        id,
        subject,
        category,
        status,
        priority,
        created_at,
        resolved_at,
        satisfaction_score
      FROM tickets
      WHERE customer_id = ${customerId}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return c.json(
      createResponse({
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          plan: customer.plan,
          totalTickets: customer.totalTickets,
          avgSatisfaction: customer.avgSatisfaction,
          accountAge: customer.accountAge
        },
        ticketBreakdown,
        categoryBreakdown,
        recentTickets
      })
    );
  } catch (error) {
    console.error('[Support] Customer metrics error:', error);
    return c.json(createErrorResponse('Failed to get customer metrics'), 500);
  }
});

/**
 * GET /support/metrics/knowledge
 * Get knowledge base metrics
 */
supportMetricsRoutes.get('/knowledge', async (c) => {
  try {
    // Article statistics
    const articleStats = await db.execute(sql`
      SELECT
        COUNT(*)::int as total_articles,
        COUNT(*) FILTER (WHERE status = 'published')::int as published,
        COUNT(*) FILTER (WHERE status = 'draft')::int as draft,
        SUM(view_count)::int as total_views,
        SUM(helpful_count)::int as total_helpful,
        SUM(not_helpful_count)::int as total_not_helpful
      FROM knowledge_articles
    `);

    // Top viewed articles
    const topViewed = await db.execute(sql`
      SELECT
        id,
        title,
        category,
        view_count,
        helpful_count,
        not_helpful_count,
        CASE
          WHEN (helpful_count + not_helpful_count) > 0
          THEN ROUND((helpful_count::float / (helpful_count + not_helpful_count)) * 100)
          ELSE 0
        END as helpfulness_rate
      FROM knowledge_articles
      WHERE status = 'published'
      ORDER BY view_count DESC
      LIMIT 10
    `);

    // Category distribution
    const categoryDistribution = await db.execute(sql`
      SELECT
        category,
        COUNT(*)::int as article_count,
        SUM(view_count)::int as total_views
      FROM knowledge_articles
      WHERE status = 'published'
      GROUP BY category
      ORDER BY article_count DESC
    `);

    // Articles needing update (low helpfulness rate)
    const needsUpdate = await db.execute(sql`
      SELECT
        id,
        title,
        category,
        helpful_count,
        not_helpful_count,
        CASE
          WHEN (helpful_count + not_helpful_count) > 0
          THEN ROUND((helpful_count::float / (helpful_count + not_helpful_count)) * 100)
          ELSE 0
        END as helpfulness_rate
      FROM knowledge_articles
      WHERE status = 'published'
        AND (helpful_count + not_helpful_count) >= 10
        AND (helpful_count::float / NULLIF(helpful_count + not_helpful_count, 0)) < 0.6
      ORDER BY (helpful_count + not_helpful_count) DESC
      LIMIT 10
    `);

    return c.json(
      createResponse({
        stats: articleStats[0],
        topViewed,
        categoryDistribution,
        needsUpdate
      })
    );
  } catch (error) {
    console.error('[Support] Knowledge metrics error:', error);
    return c.json(createErrorResponse('Failed to get knowledge metrics'), 500);
  }
});
