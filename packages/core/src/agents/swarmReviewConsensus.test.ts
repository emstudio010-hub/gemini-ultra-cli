/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createSwarm,
  currentSwarmActor,
  getSwarmEngine,
  readSwarm,
} from './swarm.js';

let root: string;
let workspace: string;
const verdict = (passed: boolean) =>
  JSON.stringify({
    passed,
    summary: passed
      ? 'The assigned artifact matches its contract.'
      : 'The assigned artifact contradicts its contract.',
    evidence: ['Read the assigned artifact.'],
  });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-review-consensus-'));
  workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'first.md'), 'first artifact');
  fs.writeFileSync(path.join(workspace, 'second.md'), 'second artifact');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const signal = () => new AbortController().signal;
const setup = (secondPasses: () => boolean = () => true) => {
  const task = createSwarm(root, 'Deliver both reviewed artifacts');
  const engine = getSwarmEngine(
    root,
    task.id,
    async () => ({
      completed: true,
      text: verdict(
        currentSwarmActor()?.name === 'second' ? secondPasses() : true,
      ),
    }),
    workspace,
  );
  engine.add('first', 'workflow-auditor', 'Review first.md', ['first.md']);
  engine.add('second', 'workflow-auditor', 'Review second.md', ['second.md']);
  return {
    task,
    engine,
    file: path.join(root, 'swarms', task.id, 'members.json'),
  };
};

it('keeps a second auditor rejection binding until explicitly corrected', async () => {
  let corrected = false;
  const { task, engine, file } = setup(() => corrected);
  await engine.wait(signal());
  const before = fs.readFileSync(file);
  expect(readSwarm(root, task.id).budget.failedTurns).toBe(1);
  expect(() => engine.finish()).toThrow(/verifier|auditor/);
  expect(fs.readFileSync(file)).toEqual(before);
  corrected = true;
  engine.post('coordinator', '@second explicitly inspect the correction');
  await engine.wait(signal());
  engine.finish();
  expect(readSwarm(root, task.id)).toMatchObject({
    phase: 'completed',
    budget: { failedTurns: 1, turns: 3 },
  });
});

it('checks every auditor artifact instead of only the first accepted scope', async () => {
  const { task, engine, file } = setup();
  await engine.wait(signal());
  fs.writeFileSync(
    path.join(workspace, 'second.md'),
    'changed after second review',
  );
  const before = fs.readFileSync(file);
  expect(() => engine.finish()).toThrow(/unchanged reviewed files/);
  expect(fs.readFileSync(file)).toEqual(before);
  expect(readSwarm(root, task.id).phase).toBe('active');
});

it.each(['invalid verdict', 'different worktree'])(
  'rejects a saved second approval with %s despite another accepted reviewer',
  async (change) => {
    const { task, engine, file } = setup();
    await engine.wait(signal());
    const saved = readSwarm(root, task.id);
    if (change === 'invalid verdict') {
      saved.members[1].result = JSON.stringify({
        passed: true,
        summary: ' ',
        evidence: ['second.md'],
      });
    } else {
      saved.members[1].verifiedTree = 'a'.repeat(40);
    }
    fs.writeFileSync(file, JSON.stringify(saved));
    const before = fs.readFileSync(file);
    expect(() => engine.finish()).toThrow(/verifier|auditor/);
    expect(fs.readFileSync(file)).toEqual(before);
  },
);

it('finishes when all active reviewers approve their unchanged artifacts', async () => {
  const { task, engine } = setup();
  await engine.wait(signal());
  engine.finish();
  expect(readSwarm(root, task.id).phase).toBe('completed');
});

it('preserves an explicitly removed auditor result without counting it as active approval', async () => {
  const { task, engine } = setup(() => false);
  await engine.wait(signal());
  engine.remove('second');
  engine.finish();
  const saved = readSwarm(root, task.id);
  expect(saved.phase).toBe('completed');
  expect(saved.members[1]).toMatchObject({
    state: 'killed',
    result: verdict(false),
  });
  expect(saved.budget.failedTurns).toBe(1);
});
