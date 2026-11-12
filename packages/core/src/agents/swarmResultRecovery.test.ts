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
  createSwarm,
  getSwarmEngine,
  readSwarm,
  readSwarmBoard,
  swarmModelSnapshot,
  swarmSnapshot,
} from './swarm.js';
import {
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';
import { readAgentTaskDetails } from './agentTaskDetails.js';
import { exportSwarmReports } from './agentReports.js';

let root: string;
const signal = () => new AbortController().signal;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-result-recovery-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([false, true])(
  'preserves an accepted report when a later incomplete long=%s turn returns partial output',
  async (long) => {
    const swarm = createSwarm(
      root,
      'Resume without discarding accepted evidence',
    );
    const original = 'Accepted evidence from the prior turn\n'.repeat(500);
    const partial = long
      ? 'Unfinished observation\n'.repeat(900) + 'PARTIAL-END'
      : 'Interrupted before the remaining question was resolved.';
    let turn = 0;
    const engine = getSwarmEngine(root, swarm.id, async () => {
      turn++;
      if (turn === 2) return { completed: false, text: partial };
      return {
        completed: true,
        text: turn === 1 ? original : 'Accepted correction',
      };
    });
    engine.add('reader', 'researcher', 'Inspect assigned evidence');
    await engine.wait(signal());
    const previous = readSwarm(root, swarm.id).members[0];
    engine.post('coordinator', '@reader continue the unresolved question');
    await engine.wait(signal());
    const paused = readSwarm(root, swarm.id).members[0];
    expect(readSwarmResultText(root, swarm.id, paused)).toBe(original);
    expect(paused.fullResult).toEqual(previous.fullResult);
    expect(paused.state).toBe('paused');
    expect(paused.lastError).toContain('Member turn did not complete.');
    expect(readSwarmBoard(root, swarm.id).at(-1)?.text).toContain(
      paused.lastError,
    );
    if (long) {
      const file = paused.lastError!.match(
        /Partial output archived: ([^\n]+)/,
      )?.[1];
      expect(file).toBeDefined();
      expect(fs.readFileSync(file!, 'utf8')).toBe(
        'Member turn did not complete.\n' + partial,
      );
      expect(file).not.toBe(
        swarmResultArchivePath(root, swarm.id, previous.fullResult!),
      );
    } else expect(paused.lastError).toContain(partial);
    expect(readSwarm(root, swarm.id).budget.failedTurns).toBe(1);
    const snapshot = swarmModelSnapshot(root, swarm.id).members[0];
    expect(snapshot.lastError).toBeDefined();
    const exported = exportSwarmReports(root, swarm.id);
    const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
    expect(
      fs.readFileSync(
        path.join(
          path.dirname(exported.manifestPath),
          manifest.reports[0].file,
        ),
        'utf8',
      ),
    ).toBe(original);
    expect(() => engine.finish()).toThrow(/paused/);
    engine.post('coordinator', '@reader retry after recovery');
    await engine.wait(signal());
    expect(readSwarm(root, swarm.id).members[0]).toMatchObject({
      state: 'waiting',
      result: 'Accepted correction',
    });
    expect(readSwarm(root, swarm.id).members[0].lastError).toBeUndefined();
  },
);

it.each([false, true])(
  'retains the prior long=%s report through a failed follow-up, exposes the error and clears it only after a new result',
  async (long) => {
    const swarm = createSwarm(
      root,
      'Preserve existing work when a later turn fails',
    );
    const original =
      'Evidence from the first accepted turn\n' +
      (long ? 'Detailed local observation\n'.repeat(900) : 'short finding');
    let turns = 0;
    const engine = getSwarmEngine(root, swarm.id, async () => {
      turns++;
      if (turns === 2) throw new Error('Follow-up transport interrupted');
      return {
        completed: true,
        text: turns === 1 ? original : 'New result after explicit retry',
      };
    });
    engine.add('reader', 'researcher', 'Inspect assigned source');
    await engine.wait(signal());
    const prior = readSwarm(root, swarm.id).members[0];
    engine.post('coordinator', '@reader inspect the remaining question');
    await engine.wait(signal());
    const paused = readSwarm(root, swarm.id).members[0];
    expect(readSwarmResultText(root, swarm.id, paused)).toBe(original);
    expect(paused.fullResult).toEqual(prior.fullResult);
    expect(paused).toMatchObject({
      state: 'paused',
      lastError: 'Follow-up transport interrupted',
    });
    expect(swarmSnapshot(root, swarm.id).members[0].lastError).toBe(
      paused.lastError,
    );
    expect(
      swarmModelSnapshot(root, swarm.id).members[0].lastError,
    ).toMatchObject({ text: paused.lastError });
    const details = readAgentTaskDetails(root, { mode: 'swarm', id: swarm.id });
    expect(details.kind).toBe('swarm');
    if (details.kind === 'swarm')
      expect(details.members[0].lastError).toBe(paused.lastError);
    const exported = exportSwarmReports(root, swarm.id);
    const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
    expect(
      fs.readFileSync(
        path.join(
          path.dirname(exported.manifestPath),
          manifest.reports[0].file,
        ),
        'utf8',
      ),
    ).toBe(original);
    expect(readSwarmBoard(root, swarm.id).at(-1)?.text).toContain(
      paused.lastError,
    );
    expect(() => engine.finish()).toThrow(/paused/);
    engine.post('coordinator', '@reader retry after the transport recovered');
    await engine.wait(signal());
    expect(readSwarm(root, swarm.id).members[0]).toMatchObject({
      state: 'waiting',
      result: 'New result after explicit retry',
    });
    expect(readSwarm(root, swarm.id).members[0].lastError).toBeUndefined();
    expect(readSwarm(root, swarm.id).budget.failedTurns).toBe(1);
  },
);

it('keeps the prior accepted report when the new output exceeds the archive limit', async () => {
  const swarm = createSwarm(
    root,
    'Keep earlier evidence after rejected oversized output',
  );
  const original = 'Accepted evidence\n'.repeat(900);
  let turns = 0;
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: ++turns === 1 ? original : 'x'.repeat(8 * 1024 * 1024 + 1),
  }));
  engine.add('reader', 'researcher', 'Read source');
  await engine.wait(signal());
  engine.post('coordinator', '@reader follow up');
  await engine.wait(signal());
  const member = readSwarm(root, swarm.id).members[0];
  expect(readSwarmResultText(root, swarm.id, member)).toBe(original);
  expect(member.lastError).toContain('8 MiB');
  expect(member.state).toBe('paused');
});

it('keeps the accepted report and publishes a separate error at the per-member wake limit', async () => {
  const swarm = createSwarm(root, 'Retain evidence at wake exhaustion');
  const original = 'Accepted bounded evidence\n'.repeat(900);
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: original,
  }));
  engine.add('reader', 'researcher', 'Read source');
  await engine.wait(signal());
  const state = readSwarm(root, swarm.id);
  state.members[0].turns = 20;
  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  fs.writeFileSync(file, JSON.stringify(state));
  engine.post('coordinator', '@reader continue');
  await engine.wait(signal());
  const member = readSwarm(root, swarm.id).members[0];
  expect(readSwarmResultText(root, swarm.id, member)).toBe(original);
  expect(member.lastError).toContain('20-turn');
  expect(member.state).toBe('paused');
  expect(member.turns).toBe(20);
  expect(readSwarmBoard(root, swarm.id).at(-1)?.text).toContain('20-turn');
});
