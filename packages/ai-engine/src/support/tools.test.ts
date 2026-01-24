import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing tools
vi.mock('../hitl/approval.js', () => ({
  requestApproval: vi.fn().mockResolvedValue({
    id: 'apr_mock_123',
    status: 'pending',
    workflowId: 'test_workflow',
    action: 'process_refund',
    description: 'Mock approval',
    riskLevel: 'high',
    payload: {},
    createdAt: new Date()
  })
}));

vi.mock('@insight-os/db-schema', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'ticket_123',
            customerId: 'cust_test',
            subject: 'Test Ticket',
            category: 'technical',
            priority: 'medium',
            status: 'open',
            createdAt: new Date()
          }
        ])
      })
    })
  },
  tickets: {}
}));

import { requestApproval } from '../hitl/approval.js';

describe('Support Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestRefund', () => {
    it('auto-approves refunds ≤ $50', async () => {
      // Import dynamically after mocks are set up
      const { requestRefund } = await import('./tools.js');

      const result = await requestRefund.execute({
        customerId: 'cust_123',
        amount: 25,
        reason: 'Product defect'
      });

      expect(result.approved).toBe(true);
      expect(result.method).toBe('auto');
      expect(result.refundId).toMatch(/^ref_/);
      expect(result.message).toContain('$25');
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('auto-approves refunds at exactly $50', async () => {
      const { requestRefund } = await import('./tools.js');

      const result = await requestRefund.execute({
        customerId: 'cust_456',
        amount: 50,
        reason: 'Service issue'
      });

      expect(result.approved).toBe(true);
      expect(result.method).toBe('auto');
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('requires approval for refunds > $50', async () => {
      const { requestRefund } = await import('./tools.js');

      const result = await requestRefund.execute({
        customerId: 'cust_789',
        amount: 100,
        reason: 'Major service failure'
      });

      expect(result.approved).toBe(false);
      expect(result.pendingApproval).toBe('apr_mock_123');
      expect(result.message).toContain('manager review');
      expect(requestApproval).toHaveBeenCalledWith(
        'refund_cust_789',
        'process_refund',
        expect.stringContaining('$100'),
        expect.objectContaining({ customerId: 'cust_789', amount: 100 }),
        'high'
      );
    });

    it('includes transaction ID when provided', async () => {
      const { requestRefund } = await import('./tools.js');

      await requestRefund.execute({
        customerId: 'cust_abc',
        amount: 200,
        reason: 'Double charged',
        transactionId: 'txn_12345'
      });

      expect(requestApproval).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ transactionId: 'txn_12345' }),
        expect.any(String)
      );
    });
  });

  describe('offerCompensation', () => {
    it('auto-approves compensation ≤ $25', async () => {
      const { offerCompensation } = await import('./tools.js');

      const result = await offerCompensation.execute({
        customerId: 'cust_123',
        amount: 15,
        reason: 'Service delay apology'
      });

      expect(result.approved).toBe(true);
      expect(result.creditId).toMatch(/^CRD-/);
      expect(result.message).toContain('$15');
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('auto-approves compensation at exactly $25', async () => {
      const { offerCompensation } = await import('./tools.js');

      const result = await offerCompensation.execute({
        customerId: 'cust_456',
        amount: 25,
        reason: 'Minor inconvenience'
      });

      expect(result.approved).toBe(true);
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it('requires approval for compensation > $25', async () => {
      const { offerCompensation } = await import('./tools.js');

      const result = await offerCompensation.execute({
        customerId: 'cust_789',
        amount: 50,
        reason: 'Significant service outage'
      });

      expect(result.approved).toBe(false);
      expect(result.pendingApproval).toBe('apr_mock_123');
      expect(requestApproval).toHaveBeenCalledWith(
        'credit_cust_789',
        'offer_credit',
        expect.stringContaining('$50'),
        expect.objectContaining({ customerId: 'cust_789', amount: 50 }),
        'medium'
      );
    });
  });

  describe('createUrgentTicket', () => {
    it('creates ticket with urgent priority and 1 hour response', async () => {
      const { createUrgentTicket } = await import('./tools.js');

      const result = await createUrgentTicket.execute({
        customerId: 'cust_vip',
        subject: 'Production down',
        summary: 'All APIs returning 500',
        priority: 'urgent',
        category: 'technical'
      });

      expect(result.ticketId).toMatch(/^TKT-/);
      expect(result.priority).toBe('urgent');
      expect(result.estimatedResponse).toBe('1 hour');
    });

    it('creates ticket with high priority and 4 hour response', async () => {
      const { createUrgentTicket } = await import('./tools.js');

      const result = await createUrgentTicket.execute({
        customerId: 'cust_123',
        subject: 'Billing discrepancy',
        summary: 'Overcharged $500',
        priority: 'high',
        category: 'billing'
      });

      expect(result.priority).toBe('high');
      expect(result.estimatedResponse).toBe('4 hours');
    });
  });

  describe('notifyHuman', () => {
    it('sends notification to expected channels', async () => {
      const { notifyHuman } = await import('./tools.js');

      const result = await notifyHuman.execute({
        customerId: 'cust_angry',
        urgency: 'critical',
        message: 'Customer threatening legal action',
        context: { previousAttempts: 3 }
      });

      expect(result.notified).toBe(true);
      expect(result.channels).toContain('slack');
      expect(result.channels).toContain('email');
      expect(result.urgency).toBe('critical');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getBillingHistory', () => {
    it('returns billing history with default limit', async () => {
      const { getBillingHistory } = await import('./tools.js');

      const result = await getBillingHistory.execute({
        customerId: 'cust_123'
      });

      expect(result.customerId).toBe('cust_123');
      expect(result.history).toBeDefined();
      expect(Array.isArray(result.history)).toBe(true);
      expect(result.totalSpent).toBeDefined();
    });

    it('respects custom limit', async () => {
      const { getBillingHistory } = await import('./tools.js');

      const result = await getBillingHistory.execute({
        customerId: 'cust_123',
        limit: 5
      });

      expect(result.customerId).toBe('cust_123');
    });
  });

  describe('getSubscription', () => {
    it('returns subscription details', async () => {
      const { getSubscription } = await import('./tools.js');

      const result = await getSubscription.execute({
        customerId: 'cust_pro'
      });

      expect(result.customerId).toBe('cust_pro');
      expect(result.plan).toBeDefined();
      expect(result.status).toBe('active');
      expect(result.features).toBeDefined();
      expect(Array.isArray(result.features)).toBe(true);
    });
  });

  describe('checkFeatureAccess', () => {
    it('returns access status for available feature', async () => {
      const { checkFeatureAccess } = await import('./tools.js');

      const result = await checkFeatureAccess.execute({
        customerId: 'cust_123',
        feature: 'api_access'
      });

      expect(result.hasAccess).toBe(true);
      expect(result.currentPlan).toBe('pro');
      expect(result.feature).toBe('api_access');
      expect(result.upgradeRequired).toBeNull();
    });

    it('indicates upgrade required for unavailable feature', async () => {
      const { checkFeatureAccess } = await import('./tools.js');

      const result = await checkFeatureAccess.execute({
        customerId: 'cust_123',
        feature: 'sso'
      });

      expect(result.hasAccess).toBe(false);
      expect(result.upgradeRequired).toBe('enterprise');
    });
  });

  describe('sendPasswordReset', () => {
    it('sends password reset with correct details', async () => {
      const { sendPasswordReset } = await import('./tools.js');

      const result = await sendPasswordReset.execute({
        customerId: 'cust_123',
        email: 'user@example.com'
      });

      expect(result.sent).toBe(true);
      expect(result.email).toBe('user@example.com');
      expect(result.expiresIn).toBe('1 hour');
    });
  });

  describe('checkPermissions', () => {
    it('returns permission details', async () => {
      const { checkPermissions } = await import('./tools.js');

      const result = await checkPermissions.execute({
        customerId: 'cust_admin'
      });

      expect(result.customerId).toBe('cust_admin');
      expect(result.role).toBeDefined();
      expect(result.permissions).toBeDefined();
      expect(Array.isArray(result.permissions)).toBe(true);
    });
  });

  describe('ragSearch', () => {
    it('returns search results with relevance scores', async () => {
      const { ragSearch } = await import('./tools.js');

      const result = await ragSearch.execute({
        query: 'how to reset password'
      });

      expect(result.query).toBe('how to reset password');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('filters by category when provided', async () => {
      const { ragSearch } = await import('./tools.js');

      const result = await ragSearch.execute({
        query: 'api authentication',
        category: 'documentation'
      });

      expect(result.query).toBe('api authentication');
    });
  });
});
