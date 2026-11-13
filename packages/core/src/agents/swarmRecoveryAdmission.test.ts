/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lockSync } from 'proper-lockfile';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createSwarm,
  consumeSwarmRequest,
  cancelSavedSwarm,
  readSwarm,
  readSwarmBoard,
  latestSwarm,
  resumeSwarm,
  setSwarmBudget,
  setSwarmModel,
  SwarmEngine,
} from './swarm.js';

let root: string;
let exitedPid: number;
beforeAll(() => {
  exitedPid = Number(
    execFileSync(
      process.execPath,
      ['-e', 'process.stdout.write(String(process.pid))'],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  expect(() => process.kill(exitedPid, 0)).toThrow();
});
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-swarm-recovery-admission-'),
  );
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
const operations = ['recover', 'resume', 'budget', 'model'] as const;
type Operation = (typeof operations)[number];
function fixture(operation: Operation) {
  const task = createSwarm(root, 'Preserve original ownership and usage');
  consumeSwarmRequest(root);
  if (operation === 'resume') cancelSavedSwarm(root, task.id);
  const file = path.join(root, 'swarms', task.id, 'members.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.members = [
    {
      name: 'reader',
      agent: 'researcher',
      brief: 'Original scope',
      state:
        operation === 'recover' || operation === 'budget'
          ? 'working'
          : 'paused',
      turns: 1,
      result: 'Original evidence',
    },
  ];
  state.budget.turns = 1;
  state.budget.failedTurns = 1;
  if (operation !== 'model') {
    state.ownerPid = exitedPid;
    const ownerFile = path.join(root, 'swarms', task.id, 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    owner.ownerPid = exitedPid;
    fs.writeFileSync(ownerFile, JSON.stringify(owner));
  }
  fs.writeFileSync(file, JSON.stringify(state));
  const runner = vi.fn(async () => ({ completed: true, text: 'Not expected' }));
  const execute = async () => {
    if (operation === 'recover') new SwarmEngine(root, task.id, runner);
    if (operation === 'resume') await resumeSwarm(root, task.id);
    if (operation === 'budget')
      setSwarmBudget(root, task.id, {
        maxRequests: 240,
        maxFailedTurns: 4,
        maxTurns: 80,
      });
    if (operation === 'model')
      setSwarmModel(root, task.id, '@reader', 'native:gemini-review-fixture');
  };
  return {
    task,
    runner,
    execute,
    board: path.join(root, 'swarms', task.id, 'board.jsonl'),
  };
}
function savedFiles(): Record<string, Buffer> {
  return Object.fromEntries(
    fs.readdirSync(root, { recursive: true }).flatMap((entry) => {
      const file = path.join(root, String(entry));
      return fs.statSync(file).isFile()
        ? [[String(entry), fs.readFileSync(file)]]
        : [];
    }),
  );
}
function posts(count: number) {
  return Array.from(
    { length: count },
    (_, index) =>
      JSON.stringify({
        seq: index + 1,
        sender: 'coordinator',
        text: 'Preserved history',
        time: '2026-11-13T00:00:00.000Z',
      }) + '\n',
  ).join('');
}
for (const operation of operations) {
  it.each(['full', 'overflow', 'damaged', 'locked'] as const)(
    `refuses ${operation} with a %s board before changing ownership, state or usage`,
    async (damage) => {
      const { task, runner, execute, board } = fixture(operation);
      let release: (() => void) | undefined;
      if (damage === 'full') fs.writeFileSync(board, posts(500));
      if (damage === 'overflow') {
        const entry = {
          seq: 1,
          sender: 'coordinator',
          text: '',
          time: '2026-11-13T00:00:00.000Z',
        };
        entry.text = 'x'.repeat(
          4 * 1024 * 1024 -
            10 -
            Buffer.byteLength(JSON.stringify(entry) + '\n'),
        );
        fs.writeFileSync(board, JSON.stringify(entry) + '\n');
      }
      if (damage === 'damaged')
        fs.writeFileSync(board, '{original damaged board');
      if (damage === 'locked')
        release = lockSync(board, { realpath: false, retries: 0 });
      try {
        const before = savedFiles();
        await expect(execute()).rejects.toThrow();
        const after = savedFiles();
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
        for (const [name, bytes] of Object.entries(before))
          expect(after[name].equals(bytes), `Saved file changed: ${name}`).toBe(
            true,
          );
        expect(readSwarm(root, task.id).budget).toMatchObject({
          requests: 1,
          turns: 1,
          failedTurns: 1,
        });
        expect(runner).not.toHaveBeenCalled();
      } finally {
        release?.();
      }
    },
  );
  it(`allows ${operation} at the final board slot while retaining original results and counters`, async () => {
    const { task, runner, execute, board } = fixture(operation);
    const before = posts(499);
    fs.writeFileSync(board, before);
    await execute();
    const saved = readSwarm(root, task.id);
    expect(saved.budget).toMatchObject({
      requests: 1,
      turns: 1,
      failedTurns: 1,
    });
    expect(saved.members[0]).toMatchObject({
      state: 'paused',
      result: 'Original evidence',
    });
    if (operation !== 'model') expect(saved.ownerPid).toBe(process.pid);
    if (operation === 'resume') expect(latestSwarm(root)?.phase).toBe('active');
    if (operation === 'budget') expect(saved.budget.maxRequests).toBe(240);
    if (operation === 'model')
      expect(saved.members[0].model).toBe('native:gemini-review-fixture');
    expect(fs.readFileSync(board, 'utf8').startsWith(before)).toBe(true);
    expect(readSwarmBoard(root, task.id)).toHaveLength(500);
    expect(runner).not.toHaveBeenCalled();
  });
}

it('blocks a lowered exhausted budget with one available post while retaining counters', () => {
  const { task, board, runner } = fixture('budget');
  const before = posts(499);
  fs.writeFileSync(board, before);
  setSwarmBudget(root, task.id, {
    maxRequests: 1,
    maxFailedTurns: 4,
    maxTurns: 80,
  });
  expect(readSwarm(root, task.id)).toMatchObject({
    phase: 'blocked',
    budget: { maxRequests: 1, requests: 1, turns: 1, failedTurns: 1 },
    members: [{ state: 'paused', result: 'Original evidence' }],
  });
  const saved = readSwarmBoard(root, task.id);
  expect(saved).toHaveLength(500);
  expect(saved.at(-1)?.text).toContain('User set cumulative budget');
  expect(saved.at(-1)?.text).toContain('model dispatch budget exhausted');
  expect(fs.readFileSync(board, 'utf8').startsWith(before)).toBe(true);
  expect(runner).not.toHaveBeenCalled();
});
