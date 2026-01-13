import { tool } from 'ai';
import { z } from 'zod';
import { requestApproval } from '../hitl/approval.js';
import { db, tickets } from '@insight-os/db-schema';

/**
 * Request a refund for a customer
 * Small refunds (≤$50) are auto-approved
 * Large refunds require human approval via HITL
 */
export const requestRefund = tool({
  description:
    'Request a refund for a customer. Refunds ≤$50 auto-approved, >$50 require manager approval.',
  parameters: z.object({
    customerId: z.string().describe('Customer ID'),
    amount: z.number().describe('Refund amount in dollars'),
    reason: z.string().describe('Reason for refund'),
    transactionId: z.string().optional().describe('Original transaction ID if available')
  }),
  execute: async ({ customerId, amount, reason, transactionId }) => {
    // Small refunds: auto-approve
    if (amount <= 50) {
      console.log(`[Support] Auto-approved refund: $${amount} for ${customerId}`);
      return {
        approved: true,
        method: 'auto',
        refundId: `ref_${Date.now()}`,
        message: `Refund of $${amount} approved and will be processed within 5-7 business days.`
      };
    }

    // Large refunds: require human approval
    const approval = await requestApproval(
      `refund_${customerId}`,
      'process_refund',
      `Refund request: $${amount} for customer ${customerId}. Reason: ${reason}`,
      { customerId, amount, reason, transactionId },
      'high'
    );

    return {
      approved: false,
      pendingApproval: approval.id,
      message: `Refund request of $${amount} has been submitted for manager review. You'll receive notification within 24 hours.`,
      estimatedResponse: '24 hours'
    };
  }
});

/**
 * Create urgent ticket for human review
 */
export const createUrgentTicket = tool({
  description: 'Create high-priority ticket for immediate human review',
  parameters: z.object({
    customerId: z.string().describe('Customer ID'),
    subject: z.string().describe('Ticket subject'),
    summary: z.string().describe('Issue summary for human agent'),
    priority: z.enum(['high', 'urgent']).describe('Priority level'),
    category: z.string().describe('Category: technical, billing, account, or general')
  }),
  execute: async (params) => {
    // Log escalation (in production, this would trigger alerts/notifications)
    console.log(`[Support] Created ${params.priority} ticket for ${params.customerId}`);

    const estimatedResponse = params.priority === 'urgent' ? '1 hour' : '4 hours';

    return {
      ticketId: `TKT-${Date.now()}`,
      priority: params.priority,
      estimatedResponse,
      message: `Your issue has been escalated to our specialist team. Expected response: ${estimatedResponse}.`
    };
  }
});

/**
 * Notify human agent (for immediate attention)
 */
export const notifyHuman = tool({
  description: 'Send immediate notification to human agent (Slack/email)',
  parameters: z.object({
    customerId: z.string(),
    urgency: z.enum(['high', 'critical']),
    message: z.string(),
    context: z.record(z.unknown()).optional()
  }),
  execute: async ({ customerId, urgency, message, context }) => {
    console.log(`[Support] HUMAN NOTIFICATION [${urgency}] for ${customerId}: ${message}`);

    // In production: send to Slack, PagerDuty, etc.
    return {
      notified: true,
      channels: ['slack', 'email'],
      urgency,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Get billing history for customer
 */
export const getBillingHistory = tool({
  description: 'Retrieve customer billing and payment history',
  parameters: z.object({
    customerId: z.string(),
    limit: z.number().optional().describe('Number of records to retrieve (default 10)')
  }),
  execute: async ({ customerId, limit = 10 }) => {
    // TODO: Query actual billing database
    console.log(`[Support] Fetching billing history for ${customerId}`);

    // Mock data for now
    return {
      customerId,
      history: [
        {
          date: '2026-01-01',
          amount: 99,
          status: 'paid',
          plan: 'pro',
          invoiceId: 'INV-001'
        }
      ],
      totalSpent: 1188,
      accountAge: 365
    };
  }
});

/**
 * Get subscription details
 */
export const getSubscription = tool({
  description: 'Get current subscription plan and status',
  parameters: z.object({
    customerId: z.string()
  }),
  execute: async ({ customerId }) => {
    // TODO: Query actual subscription database
    console.log(`[Support] Fetching subscription for ${customerId}`);

    return {
      customerId,
      plan: 'pro',
      status: 'active',
      billingCycle: 'monthly',
      nextBillingDate: '2026-02-01',
      amount: 99,
      features: ['unlimited_docs', 'api_access', 'priority_support']
    };
  }
});

/**
 * Check feature access for customer's plan
 */
export const checkFeatureAccess = tool({
  description: "Check if a feature is available on customer's plan",
  parameters: z.object({
    customerId: z.string(),
    feature: z.string().describe('Feature name to check')
  }),
  execute: async ({ customerId, feature }) => {
    // TODO: Query actual plan/feature database
    console.log(`[Support] Checking feature "${feature}" for ${customerId}`);

    const planFeatures: Record<string, string[]> = {
      free: ['basic_docs', 'limited_api'],
      pro: ['unlimited_docs', 'api_access', 'priority_support'],
      enterprise: ['unlimited_docs', 'api_access', 'priority_support', 'sso', 'dedicated_support']
    };

    const customerPlan = 'pro'; // TODO: fetch from DB
    const hasAccess = planFeatures[customerPlan]?.includes(feature) || false;

    return {
      hasAccess,
      currentPlan: customerPlan,
      feature,
      upgradeRequired: !hasAccess ? 'enterprise' : null
    };
  }
});

/**
 * Create support ticket
 */
export const createTicket = tool({
  description: 'Create a support ticket for tracking',
  parameters: z.object({
    customerId: z.string(),
    subject: z.string(),
    category: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    description: z.string(),
    conversationId: z.string().optional()
  }),
  execute: async ({
    customerId,
    subject,
    category,
    priority = 'medium',
    description,
    conversationId
  }) => {
    console.log(`[Support] Creating ticket for ${customerId}: ${subject}`);

    // Save ticket to database
    const [ticket] = await db
      .insert(tickets)
      .values({
        customerId,
        subject,
        category,
        priority,
        status: 'open',
        assignedTo: 'ai_agent',
        conversationId: conversationId || undefined,
        resolution: description,
        metadata: {
          createdBy: 'support_agent',
          description
        }
      })
      .returning();

    return {
      ticketId: ticket.id,
      customerId: ticket.customerId,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString()
    };
  }
});

/**
 * Send password reset email
 */
export const sendPasswordReset = tool({
  description: 'Send password reset link to customer email',
  parameters: z.object({
    customerId: z.string(),
    email: z.string().email()
  }),
  execute: async ({ customerId, email }) => {
    console.log(`[Support] Sending password reset to ${email}`);

    // TODO: Trigger actual password reset email
    return {
      sent: true,
      email,
      expiresIn: '1 hour',
      message: 'Password reset link sent to your email. Please check spam folder if not received.'
    };
  }
});

/**
 * Check account permissions
 */
export const checkPermissions = tool({
  description: 'View account permissions and roles',
  parameters: z.object({
    customerId: z.string()
  }),
  execute: async ({ customerId }) => {
    console.log(`[Support] Checking permissions for ${customerId}`);

    // TODO: Query actual permissions
    return {
      customerId,
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      teamMembers: 5,
      isOwner: true
    };
  }
});

/**
 * Offer compensation (goodwill credit)
 */
export const offerCompensation = tool({
  description: 'Offer account credit as compensation (requires human approval >$25)',
  parameters: z.object({
    customerId: z.string(),
    amount: z.number().describe('Credit amount in dollars'),
    reason: z.string()
  }),
  execute: async ({ customerId, amount, reason }) => {
    if (amount <= 25) {
      console.log(`[Support] Auto-approved credit: $${amount} for ${customerId}`);
      return {
        approved: true,
        creditId: `CRD-${Date.now()}`,
        amount,
        message: `A $${amount} credit has been added to your account as a goodwill gesture.`
      };
    }

    // Large credits require approval
    const approval = await requestApproval(
      `credit_${customerId}`,
      'offer_credit',
      `Credit request: $${amount} for ${customerId}. Reason: ${reason}`,
      { customerId, amount, reason },
      'medium'
    );

    return {
      approved: false,
      pendingApproval: approval.id,
      message: `Credit request submitted for approval. You'll be notified within 24 hours.`
    };
  }
});

/**
 * RAG search for knowledge base
 */
export const ragSearch = tool({
  description: 'Search knowledge base articles and documentation',
  parameters: z.object({
    query: z.string().describe('Search query'),
    category: z.string().optional().describe('Filter by category')
  }),
  execute: async ({ query, category }) => {
    console.log(`[Support] RAG search: "${query}"${category ? ` in ${category}` : ''}`);

    // TODO: Integrate with actual RAG retrieval
    return {
      results: [
        {
          title: 'Getting Started Guide',
          excerpt: 'Learn how to set up your account...',
          category: 'documentation',
          url: '/docs/getting-started',
          relevance: 0.95
        }
      ],
      query,
      count: 1
    };
  }
});

// Export all tools
export const supportTools = {
  requestRefund,
  createUrgentTicket,
  notifyHuman,
  getBillingHistory,
  getSubscription,
  checkFeatureAccess,
  createTicket,
  sendPasswordReset,
  checkPermissions,
  offerCompensation,
  ragSearch
};
