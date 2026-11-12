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
  createSwarm,
  getSwarmEngine,
  readSwarm,
  setSwarmBudget,
} from './swarm.js';
import { readSwarmResultText } from './swarmResultText.js';

let root: string;
let deadline: AbortController;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-turn-timeout-'));
  deadline = new AbortController();
  const timeout = AbortSignal.timeout;
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((duration) =>
    duration === 10 * 60 * 1000 ? deadline.signal : timeout(duration),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
const signal = () => new AbortController().signal;
const expire = () =>
  deadline.abort(
    new DOMException('Fixture member deadline expired', 'TimeoutError'),
  );

it('preserves accepted evidence and spends one failure when a member returns completion after its deadline', async () => {
  const swarm = createSwarm(
    root,
    'Respect member deadlines during result acceptance',
  );
  const original = 'Accepted earlier evidence\n'.repeat(600);
  let turns = 0;
  const engine = getSwarmEngine(root, swarm.id, async () => {
    turns++;
    if (turns === 2) expire();
    return {
      completed: true,
      text:
        turns === 1
          ? original
          : turns === 2
            ? 'Late timed-out output'
            : 'Explicit correction',
    };
  });
  engine.add('reader', 'researcher', 'Preserve accepted evidence');
  await engine.wait(signal());
  const prior = readSwarm(root, swarm.id).members[0];
  engine.post('coordinator', '@reader inspect one more question');
  await engine.wait(signal());
  const saved = readSwarm(root, swarm.id);
  expect(saved.members[0]).toMatchObject({
    state: 'paused',
    lastError: expect.stringContaining('timed out'),
  });
  expect(readSwarmResultText(root, swarm.id, saved.members[0])).toBe(original);
  expect(saved.members[0].fullResult).toEqual(prior.fullResult);
  expect(saved.budget).toMatchObject({ turns: 2, failedTurns: 1 });
  deadline = new AbortController();
  engine.post('coordinator', '@reader explicitly retry after the timeout');
  await engine.wait(signal());
  expect(readSwarm(root, swarm.id).members[0]).toMatchObject({
    state: 'waiting',
    result: 'Explicit correction',
  });
  expect(readSwarm(root, swarm.id).budget.failedTurns).toBe(1);
});

it('refuses a passing auditor verdict returned after its deadline', async () => {
  const swarm = createSwarm(
    root,
    'Do not accept an expired independent review',
  );
  const engine = getSwarmEngine(root, swarm.id, async () => {
    expire();
    return {
      completed: true,
      text: JSON.stringify({
        passed: true,
        summary: 'Late fixture review',
        evidence: ['fixture.md'],
      }),
    };
  });
  engine.add(
    'reviewer',
    'workflow-auditor',
    'Independently inspect the fixture',
  );
  await engine.wait(signal());
  const saved = readSwarm(root, swarm.id);
  expect(saved.members[0]).toMatchObject({
    state: 'paused',
    lastError: expect.stringContaining('timed out'),
  });
  expect(saved.members[0].verifiedRevision).toBeUndefined();
  expect(saved.budget.failedTurns).toBe(1);
  expect(() => engine.finish()).toThrow(/paused/);
});

it('blocks at the shared failure allowance when a timed-out member returns completion', async () => {
  const swarm = createSwarm(root, 'Account for member deadline failures');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 120,
    maxFailedTurns: 1,
    maxTurns: 40,
  });
  const engine = getSwarmEngine(root, swarm.id, async () => {
    expire();
    return { completed: true, text: 'Late result past the allowed time' };
  });
  engine.add(
    'reader',
    'researcher',
    'Stop when the failure allowance is reached',
  );
  await engine.wait(signal());
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'blocked',
    budget: { turns: 1, failedTurns: 1 },
    members: [{ state: 'paused' }],
  });
});
