/**
 * Support Swarm Handoff Evaluation
 *
 * Tests that the support swarm correctly routes inquiries to appropriate agents.
 * Run with: pnpm tsx evals/support-handoff.eval.ts
 */

import supportCases from './datasets/support-cases.json';

// Type definitions
interface EvalCase {
  id: string;
  input: string;
  expectedAgent?: string;
  expectedCategory?: string;
  expectedHandoffs?: string[];
  shouldResolve?: boolean;
  requiresHuman?: boolean;
  customer?: {
    plan?: string;
    accountAge?: number;
  };
  tags?: string[];
}

interface EvalResult {
  caseId: string;
  input: string;
  passed: boolean;
  details: string;
  metrics: {
    agentMatch: boolean;
    categoryMatch: boolean;
    resolutionMatch: boolean;
    stepsUsed: number;
  };
}

import { runSupportSwarm } from '../src/support/orchestrator.js';

async function evaluateCase(tc: EvalCase): Promise<EvalResult> {
  const result = await runSupportSwarm(
    tc.input,
    {
      customer: {
        id: 'eval_customer',
        plan: tc.customer?.plan || 'pro',
        accountAge: tc.customer?.accountAge || 100,
      },
    },
    5,
  );

  // Check agent routing
  const agentMatch = tc.expectedAgent
    ? result.agentsUsed.includes(tc.expectedAgent)
    : tc.expectedHandoffs
    ? tc.expectedHandoffs.every((agent, i) => result.agentsUsed[i] === agent)
    : true;

  // Check category
  const categoryMatch = !tc.expectedCategory || result.category === tc.expectedCategory;

  // Check resolution status
  const resolutionMatch = tc.shouldResolve === undefined || result.resolved === tc.shouldResolve;

  const passed = agentMatch && categoryMatch && resolutionMatch;

  return {
    caseId: tc.id,
    input: tc.input.slice(0, 50) + (tc.input.length > 50 ? '...' : ''),
    passed,
    details: `Agents: [${result.agentsUsed.join(' → ')}], Category: ${result.category}, Resolved: ${
      result.resolved
    }`,
    metrics: {
      agentMatch,
      categoryMatch,
      resolutionMatch,
      stepsUsed: result.agentsUsed.length,
    },
  };
}

async function runEvals() {
  console.log('🔬 Running Support Swarm Handoff Evaluations\n');
  console.log('='.repeat(60));

  const results: EvalResult[] = [];
  const cases = supportCases.cases as EvalCase[];

  for (const tc of cases) {
    const result = await evaluateCase(tc);
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} [${result.caseId}] ${result.input}`);
    if (!result.passed) {
      console.log(`   └─ ${result.details}`);
    }
  }

  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const passRate = (passed / total) * 100;

  console.log(`Pass Rate: ${passed}/${total} (${passRate.toFixed(1)}%)`);

  // Category breakdown
  const byCategory = results.reduce((acc, r) => {
    const tags = cases.find((c) => c.id === r.caseId)?.tags || ['other'];
    tags.forEach((tag) => {
      if (!acc[tag]) acc[tag] = { passed: 0, total: 0 };
      acc[tag].total++;
      if (r.passed) acc[tag].passed++;
    });
    return acc;
  }, {} as Record<string, { passed: number; total: number }>);

  console.log('\nBy Category:');
  Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([tag, stats]) => {
      const rate = ((stats.passed / stats.total) * 100).toFixed(0);
      console.log(`  ${tag}: ${stats.passed}/${stats.total} (${rate}%)`);
    });

  // Metrics
  const avgSteps = results.reduce((sum, r) => sum + r.metrics.stepsUsed, 0) / total;
  console.log(`\nAverage Steps: ${avgSteps.toFixed(1)}`);

  // Exit code for CI
  // Note: Threshold is 70% for mock implementation
  // Increase to 85%+ when connected to real support swarm
  const threshold = 70;
  if (passRate < threshold) {
    console.error(`\n❌ Evaluation failed: Pass rate ${passRate.toFixed(1)}% below ${threshold}%`);
    process.exit(1);
  }

  console.log('\n✅ Evaluation passed!');
}

// Run if executed directly
runEvals().catch(console.error);
