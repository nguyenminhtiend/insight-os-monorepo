import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestApproval,
  needsApproval,
  resolveApproval,
  getPendingApprovals,
  waitForApproval,
} from './approval.js';

describe('HITL Approval System', () => {
  describe('needsApproval', () => {
    describe('high risk actions', () => {
      const highRiskActions = [
        'delete_account',
        'destroy_data',
        'remove_user',
        'publish_content',
        'post_announcement',
        'broadcast_message',
        'send_email',
        'email_customers',
        'message_users',
        'buy_subscription',
        'purchase_item',
        'pay_invoice',
        'transfer_funds',
      ];

      it.each(highRiskActions)('requires approval for "%s"', (action) => {
        expect(needsApproval(action, 'low')).toBe(true);
        expect(needsApproval(action, 'medium')).toBe(true);
        expect(needsApproval(action, 'high')).toBe(true);
      });
    });

    describe('medium risk actions', () => {
      const mediumRiskActions = [
        'update_profile',
        'modify_settings',
        'change_password',
        'edit_document',
        'upload_file',
        'download_report',
        'register_user',
        'api_request',
        'fetch_data',
      ];

      it.each(mediumRiskActions)(
        'requires approval for "%s" unless risk is low',
        (action) => {
          expect(needsApproval(action, 'low')).toBe(false);
          expect(needsApproval(action, 'medium')).toBe(true);
          expect(needsApproval(action, 'high')).toBe(true);
        }
      );
    });

    describe('low risk actions', () => {
      const lowRiskActions = ['read_data', 'view_profile', 'list_items', 'get_status'];

      it.each(lowRiskActions)(
        'does not require approval for "%s" at low/medium risk',
        (action) => {
          expect(needsApproval(action, 'low')).toBe(false);
          expect(needsApproval(action, 'medium')).toBe(false);
        }
      );

      it.each(lowRiskActions)('requires approval for "%s" if risk level is high', (action) => {
        expect(needsApproval(action, 'high')).toBe(true);
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase action names', () => {
        expect(needsApproval('DELETE_ACCOUNT', 'low')).toBe(true);
        expect(needsApproval('SEND_EMAIL', 'low')).toBe(true);
      });

      it('handles mixed case action names', () => {
        expect(needsApproval('DeleteAccount', 'low')).toBe(true);
        expect(needsApproval('SendEmail', 'low')).toBe(true);
      });
    });
  });

  describe('requestApproval', () => {
    it('creates approval request with correct properties', async () => {
      const approval = await requestApproval(
        'workflow_123',
        'process_refund',
        'Refund $100 for customer',
        { amount: 100, customerId: 'cust_abc' },
        'high'
      );

      expect(approval.id).toMatch(/^apr_/);
      expect(approval.workflowId).toBe('workflow_123');
      expect(approval.action).toBe('process_refund');
      expect(approval.description).toBe('Refund $100 for customer');
      expect(approval.riskLevel).toBe('high');
      expect(approval.payload).toEqual({ amount: 100, customerId: 'cust_abc' });
      expect(approval.status).toBe('pending');
      expect(approval.createdAt).toBeInstanceOf(Date);
    });

    it('defaults risk level to medium', async () => {
      const approval = await requestApproval(
        'workflow_456',
        'some_action',
        'Description',
        {}
      );

      expect(approval.riskLevel).toBe('medium');
    });

    it('generates unique IDs', async () => {
      const approvals = await Promise.all([
        requestApproval('wf1', 'action', 'desc', {}),
        requestApproval('wf2', 'action', 'desc', {}),
        requestApproval('wf3', 'action', 'desc', {}),
      ]);

      const ids = approvals.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('resolveApproval', () => {
    it('approves pending request', async () => {
      const approval = await requestApproval(
        'workflow_approve',
        'test_action',
        'Test approval',
        { test: true },
        'medium'
      );

      const resolved = await resolveApproval(approval.id, true, 'admin_user', 'Looks good');

      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('approved');
      expect(resolved!.resolvedBy).toBe('admin_user');
      expect(resolved!.feedback).toBe('Looks good');
      expect(resolved!.resolvedAt).toBeInstanceOf(Date);
    });

    it('rejects pending request', async () => {
      const approval = await requestApproval(
        'workflow_reject',
        'risky_action',
        'Too risky',
        {},
        'high'
      );

      const resolved = await resolveApproval(
        approval.id,
        false,
        'security_team',
        'Policy violation'
      );

      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('rejected');
      expect(resolved!.resolvedBy).toBe('security_team');
      expect(resolved!.feedback).toBe('Policy violation');
    });

    it('returns null for non-existent request', async () => {
      const resolved = await resolveApproval('non_existent_id', true, 'admin');

      expect(resolved).toBeNull();
    });

    it('allows resolution without feedback', async () => {
      const approval = await requestApproval('wf', 'action', 'desc', {});
      const resolved = await resolveApproval(approval.id, true, 'admin');

      expect(resolved!.status).toBe('approved');
      expect(resolved!.feedback).toBeUndefined();
    });
  });

  describe('getPendingApprovals', () => {
    beforeEach(async () => {
      // Create some test approvals
      await requestApproval('workflow_a', 'action_a', 'desc', {});
      await requestApproval('workflow_b', 'action_b', 'desc', {});
      const toResolve = await requestApproval('workflow_c', 'action_c', 'desc', {});
      await resolveApproval(toResolve.id, true, 'admin');
    });

    it('returns only pending approvals', () => {
      const pending = getPendingApprovals();

      pending.forEach((approval) => {
        expect(approval.status).toBe('pending');
      });
    });

    it('filters by workflow ID', async () => {
      const specificWorkflowApproval = await requestApproval(
        'specific_workflow',
        'action',
        'desc',
        {}
      );

      const pending = getPendingApprovals('specific_workflow');

      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.some((a) => a.id === specificWorkflowApproval.id)).toBe(true);
      pending.forEach((approval) => {
        expect(approval.workflowId).toBe('specific_workflow');
      });
    });

    it('returns empty array for workflow with no pending approvals', () => {
      const pending = getPendingApprovals('non_existent_workflow');

      expect(pending).toEqual([]);
    });
  });

  describe('waitForApproval', () => {
    it('returns immediately if approval is already resolved', async () => {
      const approval = await requestApproval('wf', 'action', 'desc', {});
      await resolveApproval(approval.id, true, 'admin');

      const start = Date.now();
      const result = await waitForApproval(approval.id, 5000);
      const duration = Date.now() - start;

      expect(result.status).toBe('approved');
      expect(duration).toBeLessThan(2000); // Should return quickly, not wait
    });

    it('throws on timeout for unresolved approval', async () => {
      const approval = await requestApproval('wf_timeout', 'action', 'desc', {});

      await expect(waitForApproval(approval.id, 100)).rejects.toThrow(
        /Approval timeout/
      );
    });

    it('returns when approval is resolved during wait', async () => {
      const approval = await requestApproval('wf_async', 'action', 'desc', {});

      // Resolve after short delay
      setTimeout(async () => {
        await resolveApproval(approval.id, true, 'admin');
      }, 100);

      const result = await waitForApproval(approval.id, 5000);

      expect(result.status).toBe('approved');
    });
  });
});
