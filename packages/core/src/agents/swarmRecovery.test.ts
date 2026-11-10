/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSwarm,
  readSwarm,
  readSwarmBoard,
  consumeSwarmRequest,
  cancelSavedSwarm,
  resumeSwarm,
  setSwarmBudget,
  swarmSnapshot,
  getSwarmEngine,
} from './swarm.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-recovery-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  'json',
  'invalid-counter',
  'missing-counter',
  'missing-budget',
  'identity',
  'oversize',
  'missing',
] as const)(
  'preserves %s state and never renews unknown usage on an old swarm',
  async (damage) => {
    const swarm = createSwarm(root, 'Keep the original swarm evidence');
    consumeSwarmRequest(root);
    consumeSwarmRequest(root);
    const directory = path.join(root, 'swarms', swarm.id);
    const file = path.join(directory, 'members.json');
    const original = readSwarm(root, swarm.id);
    const board = fs.readFileSync(path.join(directory, 'board.jsonl'), 'utf8');
    const raw =
      damage === 'json'
        ? '{broken-members'
        : damage === 'invalid-counter'
          ? JSON.stringify({
              ...original,
              budget: { ...original.budget, requests: 'bad' },
            })
          : damage === 'missing-counter'
            ? JSON.stringify({
                ...original,
                budget: { ...original.budget, requests: undefined },
              })
            : damage === 'missing-budget'
              ? JSON.stringify({ ...original, budget: undefined })
              : damage === 'identity'
                ? JSON.stringify({ ...original, id: randomUUID() })
                : damage === 'oversize'
                  ? 'x'.repeat(2 * 1024 * 1024 + 1)
                  : undefined;
    if (raw === undefined) fs.rmSync(file);
    else fs.writeFileSync(file, raw);
    expect(() => consumeSwarmRequest(root)).toThrow();
    const cancelled = cancelSavedSwarm(root);
    expect(cancelled).toMatchObject({
      phase: 'cancelled',
      accountingUnknown: true,
    });
    if (raw !== undefined)
      expect(fs.readFileSync(cancelled.recoveryPath!, 'utf8')).toBe(raw);
    expect(fs.readFileSync(path.join(directory, 'board.jsonl'), 'utf8')).toBe(
      board,
    );
    expect(readSwarmBoard(root, swarm.id)).toHaveLength(1);
    expect(swarmSnapshot(root, swarm.id).budget).toMatchObject({
      requests: null,
      failedTurns: null,
      turns: null,
    });
    expect(() => consumeSwarmRequest(root)).not.toThrow();
    await expect(resumeSwarm(root, swarm.id)).rejects.toThrow(
      'Historical swarm usage is unavailable',
    );
    expect(() =>
      setSwarmBudget(root, swarm.id, {
        maxRequests: 500,
        maxFailedTurns: 10,
        maxTurns: 100,
      }),
    ).toThrow('Historical swarm usage is unavailable');
    fs.rmSync(file);
    const recoveredAgain = cancelSavedSwarm(root, swarm.id);
    expect(recoveredAgain.accountingUnknown).toBe(true);
    if (raw !== undefined)
      expect(fs.readFileSync(cancelled.recoveryPath!, 'utf8')).toBe(raw);
    expect(createSwarm(root, 'Explicit scoped successor').id).not.toBe(
      swarm.id,
    );
  },
);

it('cancels a specified swarm with a corrupt binding while keeping known usage and the board', async () => {
  const swarm = createSwarm(root, 'Keep known counters');
  consumeSwarmRequest(root);
  consumeSwarmRequest(root);
  const pointer = path.join(root, 'swarms/latest.json');
  fs.writeFileSync(pointer, '{broken-binding');
  expect(() => cancelSavedSwarm(root)).toThrow();
  const cancelled = cancelSavedSwarm(root, swarm.id);
  expect(cancelled).toMatchObject({
    phase: 'cancelled',
    accountingUnknown: false,
    budget: { requests: 2 },
  });
  const owner = JSON.parse(
    fs.readFileSync(path.join(root, 'swarms', swarm.id, 'owner.json'), 'utf8'),
  );
  expect(fs.readFileSync(owner.bindingRecoveryPath, 'utf8')).toBe(
    '{broken-binding',
  );
  await resumeSwarm(root, swarm.id);
  expect(readSwarm(root, swarm.id).budget.requests).toBe(2);
});

it('rejects cancellation with a live independent owner even when both members and binding are damaged', () => {
  const swarm = createSwarm(root, 'Preserve the active owner');
  const directory = path.join(root, 'swarms', swarm.id);
  fs.writeFileSync(path.join(directory, 'members.json'), '{broken-members');
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{broken-binding');
  const ownerFile = path.join(directory, 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  fs.writeFileSync(
    ownerFile,
    JSON.stringify({ ...owner, ownerPid: process.pid + 10000 }),
  );
  vi.spyOn(process, 'kill').mockReturnValue(true);
  expect(() => cancelSavedSwarm(root, swarm.id)).toThrow('owning CLI session');
  expect(fs.readFileSync(path.join(directory, 'members.json'), 'utf8')).toBe(
    '{broken-members',
  );
  expect(
    fs.readdirSync(directory).some((name) => name.includes('.corrupt-')),
  ).toBe(false);
});

it('recovers a legacy invalid budget using its intact owner field and refuses unverifiable ownership', () => {
  const swarm = createSwarm(root, 'Legacy owner migration');
  const directory = path.join(root, 'swarms', swarm.id);
  fs.rmSync(path.join(directory, 'owner.json'));
  fs.writeFileSync(
    path.join(root, 'swarms/latest.json'),
    JSON.stringify({ id: swarm.id }),
  );
  fs.writeFileSync(
    path.join(directory, 'members.json'),
    JSON.stringify({ ...swarm, budget: { ...swarm.budget, requests: 'bad' } }),
  );
  expect(cancelSavedSwarm(root).accountingUnknown).toBe(true);
  fs.rmSync(path.join(directory, 'owner.json'));
  fs.writeFileSync(
    path.join(root, 'swarms/latest.json'),
    JSON.stringify({ id: swarm.id }),
  );
  fs.writeFileSync(path.join(directory, 'members.json'), '{no-owner-evidence');
  expect(() => cancelSavedSwarm(root)).toThrow('Cannot verify the owner');
  expect(fs.readFileSync(path.join(directory, 'members.json'), 'utf8')).toBe(
    '{no-owner-evidence',
  );
});

it('waits for native member cleanup before replacing a damaged member record', async () => {
  const swarm = createSwarm(root, 'Stop a running member before recovery');
  let began: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  let settled = false;
  const engine = getSwarmEngine(
    root,
    swarm.id,
    async (_agent, _prompt, signal) => {
      began();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      settled = true;
      return { completed: false, text: 'Interrupted member.' };
    },
  );
  engine.add('reader', 'researcher', 'Read only');
  await started;
  const directory = path.join(root, 'swarms', swarm.id);
  fs.writeFileSync(
    path.join(directory, 'members.json'),
    '{broken-running-state',
  );
  expect(() => cancelSavedSwarm(root)).toThrow('after native members settle');
  expect(
    fs.readdirSync(directory).some((name) => name.includes('.corrupt-')),
  ).toBe(false);
  await engine.wait(new AbortController().signal);
  expect(settled).toBe(true);
  const cancelled = cancelSavedSwarm(root);
  expect(fs.readFileSync(cancelled.recoveryPath!, 'utf8')).toBe(
    '{broken-running-state',
  );
  expect(cancelled.accountingUnknown).toBe(true);
});
