/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrillGoal, prepareDrillGoalResume } from './drillGoals.js';
import {
  cancelAgentWorkflow,
  readAgentWorkflow,
  runAgentWorkflow,
} from '../agents/agentWorkflows.js';
import {
  consumeWorkflowRequest,
  savedWorkflowBudgetSummary,
} from '../agents/workflowBudget.js';

let directory: string;
let root: string;
let workspace: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-goal-'));
  root = path.join(directory, 'state');
  workspace = path.join(directory, 'workspace');
  fs.mkdirSync(workspace);
  vi.stubEnv('GEMINI_DRILL_DIR', path.join(directory, 'grant'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});
const input = {
  objective: 'Deliver the declared local report.',
  milestones: [
    {
      title: 'Deliver',
      acceptance: 'DRILL-REPORT.md contains the actual result.',
    },
  ],
};
const accepted = {
  completed: true,
  text: JSON.stringify({
    passed: true,
    summary: 'Inspected the local report.',
    evidence: ['DRILL-REPORT.md'],
  }),
};

it('persists a goal through native execution, retains required files and does not rerun completion', async () => {
  const goal = createDrillGoal(root, input, 'default', 'fixture-session');
  expect(readAgentWorkflow(root, goal.id).drillGoal?.sessionId).toBe(
    'fixture-session',
  );
  expect(prepareDrillGoalResume(root, goal.id)).toContain(goal.id);
  const finished = await runAgentWorkflow(
    root,
    goal.id,
    new AbortController().signal,
    async (agent) => {
      consumeWorkflowRequest(root);
      if (agent === 'coder')
        fs.writeFileSync(
          path.join(workspace, 'DRILL-REPORT.md'),
          'Actual deterministic fixture deliverable.',
        );
      return agent === 'workflow-auditor'
        ? accepted
        : { completed: true, text: 'Inspected local inputs.' };
    },
    undefined,
    { workspace, files: [] },
  );
  expect(finished.phase).toBe('completed');
  expect(finished.reviewFiles).toEqual(['DRILL-REPORT.md']);
  expect(finished.reviewedFiles?.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  const usage = savedWorkflowBudgetSummary(root, goal.id);
  expect(usage.requests).toBe(5);
  expect(prepareDrillGoalResume(root, goal.id)).toBeUndefined();
  expect(savedWorkflowBudgetSummary(root, goal.id).requests).toBe(5);
});

it('pauses actual running children and resumes the same goal without resetting cumulative usage', async () => {
  const goal = createDrillGoal(root, input, 'default', 'fixture-session');
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = runAgentWorkflow(
    root,
    goal.id,
    new AbortController().signal,
    async (_agent, _prompt, signal) => {
      consumeWorkflowRequest(root);
      entered();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      return { completed: false, text: 'Paused child evidence retained.' };
    },
    undefined,
    { workspace, files: ['DRILL-REPORT.md'] },
  );
  await started;
  cancelAgentWorkflow(root, goal.id, 'boost');
  expect((await pending).phase).toBe('cancelled');
  const count = savedWorkflowBudgetSummary(root, goal.id).requests;
  expect(count).toBe(2);
  expect(prepareDrillGoalResume(root, goal.id)).toContain(goal.id);
  expect(savedWorkflowBudgetSummary(root, goal.id).requests).toBe(count);
  expect(readAgentWorkflow(root, goal.id).reports).toHaveLength(2);
  cancelAgentWorkflow(root, goal.id, 'boost');
});

it('rejects invalid deliverable paths and web goals without the recorded grant before creating state', () => {
  expect(() =>
    createDrillGoal(
      root,
      { ...input, reviewFiles: ['../outside.md'] },
      'default',
      's',
    ),
  ).toThrow();
  expect(() =>
    createDrillGoal(
      root,
      { ...input, template: 'web', scope: 'localhost' },
      'default',
      's',
    ),
  ).toThrow(/授权/);
  expect(fs.existsSync(path.join(root, 'agent-workflows'))).toBe(false);
});
