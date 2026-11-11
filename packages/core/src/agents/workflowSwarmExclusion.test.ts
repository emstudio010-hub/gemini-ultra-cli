/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createAgentWorkflow,
  runAgentWorkflow,
  saveAgentWorkflow,
} from './agentWorkflows.js';
import {
  activateWorkflowBudget,
  closeWorkflowBudget,
  consumeWorkflowRequest,
  workflowBudget,
} from './workflowBudget.js';
import { createSwarm, readSwarm, getSwarmEngine } from './swarm.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-exclusion-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
function snapshot() {
  return Object.fromEntries(
    fs.readdirSync(root, { recursive: true }).flatMap((relative) => {
      const file = path.join(root, String(relative));
      return fs.statSync(file).isFile()
        ? [[String(relative), fs.readFileSync(file)]]
        : [];
    }),
  );
}
function fixture(
  mode: 'boost' | 'teamwork' | 'grill-me' = 'boost',
  phase = 'active',
) {
  const workflow = createAgentWorkflow(
    root,
    mode,
    'Historical workflow',
    'default',
  );
  consumeWorkflowRequest(root);
  closeWorkflowBudget(root, workflow);
  const swarm = createSwarm(root, 'Current swarm');
  const swarmFile = path.join(root, 'swarms', swarm.id, 'members.json');
  fs.writeFileSync(swarmFile, JSON.stringify({ ...swarm, phase }));
  return { workflow, swarm, swarmFile };
}

it.each(['boost', 'teamwork', 'grill-me'] as const)(
  'refuses %s activation before any mutation while a Swarm is active',
  (mode) => {
    const { workflow } = fixture(mode);
    const before = snapshot();
    expect(() => activateWorkflowBudget(root, workflow)).toThrow(
      'pending swarm',
    );
    expect(snapshot()).toEqual(before);
  },
);

it('refuses activation while the Swarm is blocked and preserves both task budgets', () => {
  const { workflow } = fixture('boost', 'blocked');
  const before = snapshot();
  expect(() => activateWorkflowBudget(root, workflow)).toThrow('pending swarm');
  expect(snapshot()).toEqual(before);
});

it('does not initialize an untracked legacy budget before refusing a pending Swarm', () => {
  const { workflow } = fixture();
  delete workflow.budgetVersion;
  delete workflow.budgetOwnerPid;
  saveAgentWorkflow(root, workflow);
  fs.unlinkSync(
    path.join(root, 'agent-workflows', workflow.id + '.budget.json'),
  );
  fs.unlinkSync(path.join(root, 'agent-workflows', 'current.json'));
  const before = snapshot();
  expect(() => activateWorkflowBudget(root, workflow)).toThrow('pending swarm');
  expect(snapshot()).toEqual(before);
});

it('refuses a damaged Swarm binding before changing the workflow or its owner', () => {
  const { workflow } = fixture();
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{damaged-binding');
  const before = snapshot();
  expect(() => activateWorkflowBudget(root, workflow)).toThrow('damaged');
  expect(snapshot()).toEqual(before);
});

it.each(['cancelled', 'completed'])(
  'allows workflow activation after a %s Swarm, retaining spent usage and Swarm bytes',
  (phase) => {
    const { workflow, swarm } = fixture('boost', phase);
    const before = Object.fromEntries(
      Object.entries(snapshot()).filter(([file]) => file.startsWith('swarms')),
    );
    activateWorkflowBudget(root, workflow);
    expect(workflowBudget(root, workflow)).toMatchObject({
      state: 'active',
      requests: 1,
    });
    expect(readSwarm(root, swarm.id).phase).toBe(phase);
    for (const [file, bytes] of Object.entries(before))
      expect(fs.readFileSync(path.join(root, file))).toEqual(bytes);
  },
);

it('refuses a direct workflow run against a pending Swarm before changing phase or launching members', async () => {
  const { workflow } = fixture();
  const ledger = path.join(
    root,
    'agent-workflows',
    workflow.id + '.budget.json',
  );
  fs.writeFileSync(
    ledger,
    JSON.stringify({ ...workflowBudget(root, workflow), state: 'active' }),
  );
  const before = snapshot();
  const run = vi.fn(async (agent: string) => ({
    completed: true,
    text:
      agent === 'workflow-auditor'
        ? JSON.stringify({
            passed: true,
            summary: 'Inspected',
            evidence: ['fixture'],
          })
        : 'Evidence',
  }));
  await expect(
    runAgentWorkflow(root, workflow.id, new AbortController().signal, run),
  ).rejects.toThrow('pending swarm');
  expect(run).not.toHaveBeenCalled();
  expect(snapshot()).toEqual(before);
});

it('waits for cancelled Swarm members to settle before allowing workflow activation', async () => {
  const { workflow, swarm, swarmFile } = fixture();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = getSwarmEngine(root, swarm.id, async () => {
    enter();
    await pending;
    return { completed: true, text: 'Retained after cancellation' };
  });
  engine.add('author', 'coder', 'Complete the assigned local work');
  await entered;
  fs.writeFileSync(
    swarmFile,
    JSON.stringify({ ...readSwarm(root, swarm.id), phase: 'cancelled' }),
  );
  try {
    const before = snapshot();
    expect(() => activateWorkflowBudget(root, workflow)).toThrow(
      'pending swarm',
    );
    expect(() =>
      createAgentWorkflow(root, 'boost', 'A new task', 'default'),
    ).toThrow('pending swarm');
    expect(snapshot()).toEqual(before);
  } finally {
    release();
    await engine.wait(new AbortController().signal);
  }
  activateWorkflowBudget(root, workflow);
  expect(workflowBudget(root, workflow).requests).toBe(1);
});
