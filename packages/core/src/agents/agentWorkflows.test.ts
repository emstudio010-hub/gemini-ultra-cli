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
  readAgentWorkflow,
  saveAgentWorkflow,
  cancelAgentWorkflow,
  type WorkflowAgentRunner,
} from './agentWorkflows.js';
import { workflowAuditor } from './ultraSpecialists.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { createSwarm } from './swarm.js';
import {
  activateWorkflowBudget,
  consumeWorkflowRequest,
  setWorkflowBudget,
  workflowBudget,
} from './workflowBudget.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-test-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
const result = (text: string) => ({ completed: true, text });
const verdict = (passed: boolean) =>
  result(
    JSON.stringify({
      passed,
      summary: passed
        ? 'Inspected delivered artifact.'
        : 'The required artifact is missing.',
      evidence: ['deliverable.txt'],
    }),
  );

it('requires resolving an open native task before another mode can claim the same workspace', () => {
  const record = createAgentWorkflow(root, 'boost', 'First task', 'default');
  expect(() => createSwarm(root, 'Overlapping task')).toThrow(
    'pending workflow',
  );
  cancelAgentWorkflow(root, record.id);
  createSwarm(root, 'Explicit successor');
  expect(() =>
    createAgentWorkflow(root, 'boost', 'Another overlap', 'default'),
  ).toThrow('pending workflow or swarm');
});

it('rejects another live owner before mutating its ready workflow or starting a model call', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Preserve the owning session',
    'default',
  );
  const budgetFile = path.join(
    root,
    'agent-workflows',
    `${record.id}.budget.json`,
  );
  fs.writeFileSync(
    budgetFile,
    JSON.stringify({
      ...workflowBudget(root, record),
      ownerPid: process.pid + 10000,
    }),
  );
  vi.spyOn(process, 'kill').mockReturnValue(true);
  let calls = 0;
  await expect(
    runAgentWorkflow(
      root,
      record.id,
      new AbortController().signal,
      async () => {
        calls++;
        return result('Should not start.');
      },
    ),
  ).rejects.toThrow('owning CLI session');
  expect(calls).toBe(0);
  expect(readAgentWorkflow(root, record.id).phase).toBe('ready');
});

it('registers the auditor before the tool registry exists and resolves read-only tools later', () => {
  let registryReady = false;
  const context = {
    get toolRegistry() {
      if (!registryReady) throw new Error('Tool registry not initialized yet');
      return {
        getAllToolNames: () => [
          'read_file',
          'complete_task',
          'write_file',
          'run_agent_workflow',
        ],
      };
    },
  } as unknown as AgentLoopContext;
  const definition = workflowAuditor(context);
  registryReady = true;
  expect(definition.toolConfig.tools).toEqual(['read_file', 'complete_task']);
});

it('rejects unapproved scoping records without changing them or starting workers', async () => {
  const record = createAgentWorkflow(
    root,
    'teamwork',
    'Deliver the feature',
    'default',
  );
  let calls = 0;
  await expect(
    runAgentWorkflow(
      root,
      record.id,
      new AbortController().signal,
      async () => {
        calls++;
        return result('unexpected');
      },
    ),
  ).rejects.toThrow('approved and ready');
  expect(calls).toBe(0);
  expect(readAgentWorkflow(root, record.id).phase).toBe('scoping');
});

it('corrects a failed acceptance review, then requires an independent final audit', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Write the deliverable',
    'default',
  );
  let writes = 0;
  let reviews = 0;
  const runner: WorkflowAgentRunner = async (agent) => {
    if (agent === 'researcher') return result('Evidence found.');
    if (agent === 'coder') {
      writes++;
      if (writes === 2)
        fs.writeFileSync(path.join(root, 'deliverable.txt'), 'ready');
      return result('Implementation stage ended.');
    }
    reviews++;
    return verdict(fs.existsSync(path.join(root, 'deliverable.txt')));
  };
  const finished = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    runner,
  );
  expect(writes).toBe(2);
  expect(reviews).toBe(3);
  expect(finished.phase).toBe('completed');
  expect(readAgentWorkflow(root, record.id).reports.at(-1)?.stage).toBe(
    'final audit',
  );
});

it('keeps unsupported free-form review blocked and refuses an automatic retry', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Deliver a feature',
    'default',
  );
  const blocked = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async () => result('Looks good; all done!'),
  );
  expect(blocked.phase).toBe('blocked');
  expect(blocked.milestones[0].completed).toBe(false);
  expect(blocked.reports.filter((item) => item.agent === 'coder')).toHaveLength(
    2,
  );
  await expect(
    runAgentWorkflow(root, record.id, new AbortController().signal, async () =>
      verdict(true),
    ),
  ).rejects.toThrow('approved and ready');
});

it('cancels all launched readers before releasing the workspace and never starts a writer', async () => {
  const record = createAgentWorkflow(root, 'boost', 'Investigate', 'default');
  let started = 0;
  let settled = 0;
  let resolveStarted: () => void = () => {};
  const bothStarted = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const pending = runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (agent, _prompt, signal) => {
      expect(agent).toBe('researcher');
      started++;
      if (started === 2) resolveStarted();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      settled++;
      return { completed: false, text: 'Partial investigation retained.' };
    },
  );
  await bothStarted;
  await expect(
    runAgentWorkflow(root, record.id, new AbortController().signal, async () =>
      verdict(true),
    ),
  ).rejects.toThrow();
  cancelAgentWorkflow(root, record.id);
  const cancelled = await pending;
  expect(settled).toBe(2);
  expect(cancelled.phase).toBe('cancelled');
  expect(readAgentWorkflow(root, record.id).reports).toHaveLength(2);
  // An explicit user resume may start again after both readers have settled.
  cancelled.phase = 'ready';
  saveAgentWorkflow(root, cancelled);
  activateWorkflowBudget(root, cancelled);
  expect(
    (
      await runAgentWorkflow(
        root,
        record.id,
        new AbortController().signal,
        async () => verdict(true),
      )
    ).phase,
  ).toBe('completed');
});

it('retains failed implementation rounds across resume and requires a local limit increase', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Deliver a bounded fix',
    'default',
  );
  let writes = 0;
  const runner: WorkflowAgentRunner = async (agent) => {
    if (agent === 'coder') {
      writes++;
      return { completed: false, text: 'Concrete implementation failure.' };
    }
    return result('Evidence retained.');
  };
  let blocked = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    runner,
  );
  expect(writes).toBe(1);
  activateWorkflowBudget(root, blocked);
  blocked.phase = 'ready';
  saveAgentWorkflow(root, blocked);
  blocked = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    runner,
  );
  expect(writes).toBe(2);
  expect(() => activateWorkflowBudget(root, blocked)).toThrow(
    'implementation-round budget exhausted',
  );
  expect(workflowBudget(root, blocked)).toMatchObject({
    implementationRounds: [2],
    failedStages: 2,
  });
  setWorkflowBudget(root, blocked, {
    maxRequests: 240,
    maxFailedStages: 4,
    maxImplementationRounds: 3,
  });
  activateWorkflowBudget(root, blocked);
  blocked.phase = 'ready';
  saveAgentWorkflow(root, blocked);
  const finished = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (agent) =>
      agent === 'workflow-auditor'
        ? verdict(true)
        : result('Actual stage finished.'),
  );
  expect(finished.phase).toBe('completed');
  expect(workflowBudget(root, finished)).toMatchObject({
    implementationRounds: [3],
    failedStages: 2,
    state: 'closed',
  });
});

it('retains shared dispatch reservations despite concurrent stage record saves and cancels peers on exhaustion', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Bound every model dispatch',
    'default',
  );
  setWorkflowBudget(root, record, {
    maxRequests: 2,
    maxFailedStages: 4,
    maxImplementationRounds: 2,
  });
  consumeWorkflowRequest(root); // The coordinator spends one dispatch before workers start.
  let permitted = 0;
  let abortedPeer = false;
  const blocked = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (_agent, _prompt, signal) => {
      consumeWorkflowRequest(undefined); // Native context carries the record identity.
      permitted++;
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            abortedPeer = true;
            resolve();
          },
          { once: true },
        ),
      );
      return { completed: false, text: 'Partial evidence retained.' };
    },
  );
  expect(permitted).toBe(1);
  expect(abortedPeer).toBe(true);
  expect(blocked.phase).toBe('blocked');
  expect(workflowBudget(root, blocked)).toMatchObject({
    requests: 2,
    failedStages: 0,
    state: 'paused',
  });
  expect(
    blocked.reports.every((report) =>
      report.text.includes('model dispatch budget exhausted'),
    ),
  ).toBe(true);
  expect(() => activateWorkflowBudget(root, blocked)).toThrow(
    'model dispatch budget exhausted',
  );
  cancelAgentWorkflow(root, blocked.id);
  expect(() => consumeWorkflowRequest(root)).not.toThrow();
  expect(workflowBudget(root, blocked).requests).toBe(2);
});

it('migrates old saved implementation attempts and failed review evidence without granting a fresh round', () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Restore a legacy workflow',
    'default',
  );
  fs.rmSync(path.join(root, 'agent-workflows', `${record.id}.budget.json`));
  record.stage = 'implement 1.2';
  record.reports = [
    {
      agent: 'coder',
      stage: 'implement 1.1',
      completed: true,
      text: 'Initial implementation.',
    },
    {
      agent: 'workflow-auditor',
      stage: 'review 1.1',
      completed: true,
      text: verdict(false).text,
    },
  ];
  expect(workflowBudget(root, record)).toMatchObject({
    implementationRounds: [2],
    failedStages: 1,
    requests: 0,
  });
  expect(() => activateWorkflowBudget(root, record)).toThrow(
    'implementation-round budget exhausted',
  );
});

it('stops at the cumulative failed-stage allowance and retains concrete reports', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Bound failing investigations',
    'default',
  );
  setWorkflowBudget(root, record, {
    maxRequests: 240,
    maxFailedStages: 1,
    maxImplementationRounds: 2,
  });
  let writers = 0;
  const blocked = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (agent) => {
      if (agent === 'coder') writers++;
      return { completed: false, text: 'Concrete provider limit retained.' };
    },
  );
  expect(writers).toBe(0);
  expect(blocked.phase).toBe('blocked');
  expect(
    blocked.reports.some((report) =>
      report.text.includes('Concrete provider limit'),
    ),
  ).toBe(true);
  expect(workflowBudget(root, blocked)).toMatchObject({
    failedStages: 1,
    state: 'paused',
  });
  expect(() => activateWorkflowBudget(root, blocked)).toThrow(
    'failed-stage budget exhausted',
  );
});
