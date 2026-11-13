/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { createSwarm, getSwarmEngine, readSwarm } from './swarm.js';
import { captureReviewFiles } from './swarmReviewFiles.js';
import { ManageSwarmTool } from './swarmTools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ApprovalMode } from '../policy/types.js';
let root: string;
let workspace: string;
const verdict = JSON.stringify({
  passed: true,
  summary: 'Checked REPORT.md against evidence.json',
  evidence: ['REPORT.md', 'evidence.json'],
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-review-files-'));
  workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'REPORT.md'), 'original');
  fs.writeFileSync(path.join(workspace, 'evidence.json'), '{}');
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
const setup = () => {
  const task = createSwarm(root, 'Review the current artifacts');
  const engine = getSwarmEngine(
    root,
    task.id,
    async () => ({ completed: true, text: verdict }),
    workspace,
  );
  return { task, engine };
};
it.each(['replace', 'delete'] as const)(
  'refuses finish after a reviewed file changes by %s',
  async (change) => {
    const { task, engine } = setup();
    engine.add('reviewer', 'workflow-auditor', 'Inspect current artifacts', [
      'REPORT.md',
      'evidence.json',
    ]);
    await engine.wait(new AbortController().signal);
    expect(
      readSwarm(root, task.id).members[0].reviewedFiles?.files,
    ).toHaveLength(2);
    if (change === 'replace')
      fs.writeFileSync(path.join(workspace, 'REPORT.md'), 'modified');
    else fs.unlinkSync(path.join(workspace, 'REPORT.md'));
    const file = path.join(root, 'swarms', task.id, 'members.json');
    const before = fs.readFileSync(file);
    expect(() => engine.finish()).toThrow(/unchanged reviewed files/);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(readSwarm(root, task.id).phase).toBe('active');
  },
);
it('keeps raw passing output unaccepted when files change during review', async () => {
  const task = createSwarm(root, 'Do not approve files changed during review');
  let release!: () => void;
  let entered!: () => void;
  const start = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = getSwarmEngine(
    root,
    task.id,
    async () => {
      entered();
      await gate;
      return { completed: true, text: verdict };
    },
    workspace,
  );
  engine.add('reviewer', 'workflow-auditor', 'Inspect REPORT.md', [
    'REPORT.md',
  ]);
  await start;
  fs.writeFileSync(path.join(workspace, 'REPORT.md'), 'modified');
  release();
  await engine.wait(new AbortController().signal);
  expect(readSwarm(root, task.id)).toMatchObject({
    budget: { failedTurns: 1 },
    members: [
      {
        state: 'paused',
        result: verdict,
        lastError: expect.stringContaining('Reviewed files changed'),
      },
    ],
  });
  expect(readSwarm(root, task.id).members[0].verifiedRevision).toBeUndefined();
});
it('allows unchanged declared artifacts despite unrelated workspace changes', async () => {
  const { task, engine } = setup();
  engine.add('reviewer', 'workflow-auditor', 'Inspect REPORT.md', [
    'REPORT.md',
  ]);
  await engine.wait(new AbortController().signal);
  fs.writeFileSync(path.join(workspace, 'unrelated.txt'), 'unrelated');
  engine.finish();
  expect(readSwarm(root, task.id).phase).toBe('completed');
});
it('requires an explicit review list and can reassign a settled historical auditor', async () => {
  const { task, engine } = setup();
  expect(() =>
    engine.add('reviewer', 'workflow-auditor', 'Missing review scope'),
  ).toThrow(/review_files/);
  expect(readSwarm(root, task.id).budget.turns).toBe(0);
  engine.add('reviewer', 'workflow-auditor', 'Inspect REPORT.md', [
    'REPORT.md',
  ]);
  await engine.wait(new AbortController().signal);
  engine.setReviewFiles('reviewer', ['REPORT.md', 'evidence.json']);
  expect(() => engine.finish()).toThrow(/verdict/);
  engine.post(
    'coordinator',
    '@reviewer explicitly inspect the updated file list',
  );
  await engine.wait(new AbortController().signal);
  engine.finish();
  expect(readSwarm(root, task.id).members[0].reviewedFiles?.files).toHaveLength(
    2,
  );
});
it('rejects outside paths, duplicate paths, symlinks and oversized review inputs', () => {
  const outside = path.join(root, 'outside.txt');
  fs.writeFileSync(outside, 'outside');
  expect(() => captureReviewFiles(workspace, ['../outside.txt'])).toThrow(
    /inside/,
  );
  expect(() =>
    captureReviewFiles(workspace, ['REPORT.md', './REPORT.md']),
  ).toThrow(/duplicate/);
  const link = path.join(workspace, 'linked');
  fs.symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => captureReviewFiles(workspace, ['linked/outside.txt'])).toThrow(
    /inside/,
  );
  const large = path.join(workspace, 'large.bin');
  const fd = fs.openSync(large, 'w');
  try {
    fs.ftruncateSync(fd, 64 * 1024 * 1024 + 1);
  } finally {
    fs.closeSync(fd);
  }
  expect(() => captureReviewFiles(workspace, ['large.bin'])).toThrow(/64 MiB/);
});

it('binds public tool review scope and lets an explicit post replace a settled review list', async () => {
  const task = createSwarm(
    root,
    'Use declared review files through manage_swarm',
  );
  let calls = 0;
  const engine = getSwarmEngine(root, task.id, async () => {
    calls++;
    return { completed: true, text: verdict };
  });
  const context = {
    config: {
      storage: { getProjectTempDir: () => root },
      getTargetDir: () => workspace,
      getApprovalMode: () => ApprovalMode.DEFAULT,
    },
  } as unknown as AgentLoopContext;
  const tool = new ManageSwarmTool(context, createMockMessageBus());
  const execute = (params: Parameters<ManageSwarmTool['build']>[0]) =>
    tool.build(params).execute({ abortSignal: new AbortController().signal });
  await expect(
    execute({
      swarm_id: task.id,
      action: 'add',
      name: 'reviewer',
      agent: 'workflow-auditor',
      brief: 'Inspect artifacts',
    }),
  ).rejects.toThrow(/review_files/);
  expect(calls).toBe(0);
  await execute({
    swarm_id: task.id,
    action: 'add',
    name: 'reviewer',
    agent: 'workflow-auditor',
    brief: 'Inspect REPORT.md',
    review_files: ['REPORT.md'],
  });
  await engine.wait(new AbortController().signal);
  fs.writeFileSync(path.join(workspace, 'evidence.json'), 'changed evidence');
  await execute({
    swarm_id: task.id,
    action: 'post',
    name: 'reviewer',
    text: '@reviewer explicitly inspect updated artifacts',
    review_files: ['REPORT.md', 'evidence.json'],
  });
  await engine.wait(new AbortController().signal);
  expect(readSwarm(root, task.id).members[0].reviewedFiles?.files).toHaveLength(
    2,
  );
  fs.writeFileSync(
    path.join(workspace, 'evidence.json'),
    'changed after review',
  );
  await expect(
    execute({ swarm_id: task.id, action: 'finish' }),
  ).rejects.toThrow(/unchanged reviewed files/);
  expect(calls).toBe(2);
});

it('refuses to rebind a saved task to a different workspace', () => {
  const { task } = setup();
  const other = path.join(root, 'other');
  fs.mkdirSync(other);
  const file = path.join(root, 'swarms', task.id, 'members.json');
  const before = fs.readFileSync(file);
  expect(() =>
    getSwarmEngine(
      root,
      task.id,
      async () => ({ completed: true, text: verdict }),
      other,
    ),
  ).toThrow(/another workspace/);
  expect(fs.readFileSync(file)).toEqual(before);
});

it('allows an explicit member-report-only review without claiming workspace files', async () => {
  const { task, engine } = setup();
  engine.add(
    'reviewer',
    'workflow-auditor',
    'Review member reports only; no workspace deliverables',
    [],
  );
  await engine.wait(new AbortController().signal);
  expect(readSwarm(root, task.id).members[0].reviewedFiles?.files).toEqual([]);
  fs.writeFileSync(
    path.join(workspace, 'REPORT.md'),
    'Not in the declared review scope',
  );
  engine.finish();
  expect(readSwarm(root, task.id).phase).toBe('completed');
});

it('requires a new file-bound review after binding an older unbound approval', async () => {
  const task = createSwarm(
    root,
    'Adopt an older saved task without inventing file approval',
  );
  const engine = getSwarmEngine(root, task.id, async () => ({
    completed: true,
    text: verdict,
  }));
  engine.add('reviewer', 'workflow-auditor', 'Inspect the reports');
  await engine.wait(new AbortController().signal);
  engine.bindWorkspace(workspace);
  expect(() => engine.finish()).toThrow(/unchanged reviewed files/);
  engine.setReviewFiles('reviewer', ['REPORT.md']);
  engine.post('coordinator', '@reviewer explicitly inspect REPORT.md now');
  await engine.wait(new AbortController().signal);
  engine.finish();
  expect(readSwarm(root, task.id).phase).toBe('completed');
});

it('pauses an older auditor on wake without inventing an empty review scope or spending a turn', async () => {
  const task = createSwarm(
    root,
    'Require explicit scope when adopting an old auditor',
  );
  let calls = 0;
  const engine = getSwarmEngine(root, task.id, async () => {
    calls++;
    return { completed: true, text: verdict };
  });
  engine.add('reviewer', 'workflow-auditor', 'Review the saved reports');
  await engine.wait(new AbortController().signal);
  engine.bindWorkspace(workspace);
  const before = readSwarm(root, task.id);
  engine.post('coordinator', '@reviewer inspect the current deliverables');
  await engine.wait(new AbortController().signal);
  const paused = readSwarm(root, task.id);
  expect(calls).toBe(1);
  expect(paused.budget).toEqual(before.budget);
  expect(paused.members[0]).toMatchObject({
    state: 'paused',
    turns: before.members[0].turns,
    result: verdict,
    lastError: expect.stringContaining('review_files'),
  });
  expect(paused.members[0].reviewFiles).toBeUndefined();
  expect(paused.members[0].reviewedFiles).toBeUndefined();
  expect(paused.members[0].verifiedRevision).toBeUndefined();
  expect(() => engine.finish()).toThrow(/paused/);
  engine.setReviewFiles('reviewer', ['REPORT.md']);
  engine.post('coordinator', '@reviewer explicitly inspect REPORT.md');
  await engine.wait(new AbortController().signal);
  engine.finish();
  expect(calls).toBe(2);
  expect(readSwarm(root, task.id).phase).toBe('completed');
});
