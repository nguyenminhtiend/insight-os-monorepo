import { describe, it, expect, vi } from 'vitest';
import { supportAgents, handoffTool } from './agents.js';

describe('Support Agents', () => {
  describe('agent definitions', () => {
    it('has all required agents', () => {
      const requiredAgents = ['triage', 'technical', 'billing', 'account', 'escalation'];

      requiredAgents.forEach((agent) => {
        expect(supportAgents[agent]).toBeDefined();
      });
    });

    it('each agent has required properties', () => {
      Object.values(supportAgents).forEach((agent) => {
        expect(agent.name).toBeDefined();
        expect(agent.role).toBeDefined();
        expect(agent.systemPrompt).toBeDefined();
        expect(agent.canHandoff).toBeDefined();
        expect(Array.isArray(agent.canHandoff)).toBe(true);
      });
    });
  });

  describe('triage agent', () => {
    const triage = supportAgents.triage;

    it('has router role', () => {
      expect(triage.role).toBe('router');
    });

    it('can handoff to all specialist agents', () => {
      expect(triage.canHandoff).toContain('technical');
      expect(triage.canHandoff).toContain('billing');
      expect(triage.canHandoff).toContain('account');
      expect(triage.canHandoff).toContain('escalation');
    });

    it('system prompt mentions routing', () => {
      expect(triage.systemPrompt.toLowerCase()).toContain('route');
    });
  });

  describe('specialist agents', () => {
    const specialists = ['technical', 'billing', 'account'];

    it.each(specialists)('%s agent has specialist role', (agentName) => {
      expect(supportAgents[agentName].role).toBe('specialist');
    });

    it.each(specialists)('%s can handoff to escalation and triage', (agentName) => {
      const agent = supportAgents[agentName];
      expect(agent.canHandoff).toContain('escalation');
      expect(agent.canHandoff).toContain('triage');
    });
  });

  describe('escalation agent', () => {
    const escalation = supportAgents.escalation;

    it('has escalation role', () => {
      expect(escalation.role).toBe('escalation');
    });

    it('cannot handoff (terminal agent)', () => {
      expect(escalation.canHandoff).toHaveLength(0);
    });

    it('system prompt mentions human review', () => {
      expect(escalation.systemPrompt.toLowerCase()).toContain('human');
    });
  });

  describe('technical agent specifics', () => {
    const technical = supportAgents.technical;

    it('mentions knowledge base search in prompt', () => {
      expect(technical.systemPrompt).toContain('ragSearch');
    });

    it('mentions escalation criteria', () => {
      expect(technical.systemPrompt).toContain('escalate');
    });
  });

  describe('billing agent specifics', () => {
    const billing = supportAgents.billing;

    it('mentions refund thresholds in prompt', () => {
      expect(billing.systemPrompt).toContain('$50');
    });

    it('mentions verification in prompt', () => {
      expect(billing.systemPrompt.toLowerCase()).toContain('verify');
    });
  });

  describe('account agent specifics', () => {
    const account = supportAgents.account;

    it('mentions security in prompt', () => {
      expect(account.systemPrompt.toLowerCase()).toContain('security');
    });

    it('mentions password reset', () => {
      expect(account.systemPrompt).toContain('password reset');
    });
  });
});

describe('Handoff Tool', () => {
  it('has correct parameters schema', () => {
    const params = handoffTool.parameters;
    expect(params).toBeDefined();
  });

  it('execute returns handoff data', async () => {
    const result = await handoffTool.execute({
      targetAgent: 'billing',
      context: 'Customer needs help with invoice',
      data: { invoiceId: 'INV-123' },
    });

    expect(result.handoff).toBe(true);
    expect(result.targetAgent).toBe('billing');
    expect(result.context).toBe('Customer needs help with invoice');
    expect(result.data).toEqual({ invoiceId: 'INV-123' });
  });

  it('execute works without optional data', async () => {
    const result = await handoffTool.execute({
      targetAgent: 'technical',
      context: 'API returning errors',
    });

    expect(result.handoff).toBe(true);
    expect(result.targetAgent).toBe('technical');
    expect(result.context).toBe('API returning errors');
    expect(result.data).toBeUndefined();
  });
});

describe('Agent Handoff Validity', () => {
  // Test that all handoff targets are valid agents
  it('all handoff targets are valid agent names', () => {
    const validAgents = Object.keys(supportAgents);

    Object.entries(supportAgents).forEach(([agentName, agent]) => {
      agent.canHandoff.forEach((target) => {
        expect(validAgents).toContain(target);
      });
    });
  });

  it('no agent can handoff to itself', () => {
    Object.entries(supportAgents).forEach(([agentName, agent]) => {
      expect(agent.canHandoff).not.toContain(agentName);
    });
  });

  it('escalation is reachable from all specialist agents', () => {
    const specialists = ['technical', 'billing', 'account'];

    specialists.forEach((agentName) => {
      expect(supportAgents[agentName].canHandoff).toContain('escalation');
    });
  });
});
