/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createAgentWorkflow,
  runAgentWorkflow,
  readAgentWorkflow,
  saveAgentWorkflow,
  cancelAgentWorkflow,
  type WorkflowAgentRunner,
} from './agentWorkflows.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-test-'));
});
afterEach(() => {
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
