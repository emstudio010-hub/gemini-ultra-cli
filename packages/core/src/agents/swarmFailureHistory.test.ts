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
  getSwarmEngine,
  readSwarm,
  swarmModelSnapshot,
} from './swarm.js';
import { exportSwarmReports } from './agentReports.js';
import {
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-failure-history-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it('preserves failure accounting and marks a permanent history gap when archiving fails', async () => {
  const task = createSwarm(
    root,
    'Keep available evidence after a storage failure',
  );
  let calls = 0;
  const engine = getSwarmEngine(root, task.id, async () => ({
    completed: ++calls !== 2,
    text: calls === 2 ? 'Unfinished observation' : 'Accepted evidence',
  }));
  engine.add('reader', 'researcher', 'Read only');
  await engine.wait(signal());
  const blocker = path.join(root, 'swarms', task.id, 'results');
  fs.writeFileSync(blocker, 'Controlled fixture archive blocker');
  engine.post('coordinator', '@reader next');
  await engine.wait(signal());
  expect(fs.readFileSync(blocker, 'utf8')).toBe(
    'Controlled fixture archive blocker',
  );
  fs.unlinkSync(blocker);
  const paused = readSwarm(root, task.id);
  expect(paused.budget.failedTurns).toBe(1);
  expect(paused.members[0]).toMatchObject({
    state: 'paused',
    result: 'Accepted evidence',
    failureHistoryIncomplete: true,
    lastError: expect.stringContaining('Failed attempt archive unavailable'),
  });
  engine.post('coordinator', '@reader explicitly recover');
  await engine.wait(signal());
  const recovered = readSwarm(root, task.id).members[0];
  expect(recovered.lastError).toBeUndefined();
  expect(recovered.failureHistoryIncomplete).toBe(true);
  expect(() => exportSwarmReports(root, task.id)).toThrow(
    'history is incomplete',
  );
  expect(
    swarmModelSnapshot(root, task.id).members[0].failureHistoryIncomplete,
  ).toBe(true);
});
const signal = () => new AbortController().signal;

it.each([false, true])(
  'preserves full failed output across successful recovery (long=%s)',
  async (long) => {
    const task = createSwarm(root, 'Keep all failed observations available');
    const original = 'Accepted original evidence';
    const partial =
      'FAILED_START\n' +
      'Unfinished observation 中文\n'.repeat(long ? 1500 : 1) +
      'FAILED_TAIL';
    let calls = 0;
    const prompts: string[] = [];
    const engine = getSwarmEngine(root, task.id, async (_role, prompt) => {
      prompts.push(prompt);
      calls++;
      return calls === 2
        ? { completed: false, text: partial }
        : {
            completed: true,
            text: calls === 1 ? original : 'Accepted recovery',
          };
    });
    engine.add('reader', 'researcher', 'Read only within assigned scope');
    await engine.wait(signal());
    engine.post('coordinator', '@reader inspect next question');
    await engine.wait(signal());
    const paused = readSwarm(root, task.id).members[0];
    expect(readSwarmResultText(root, task.id, paused)).toBe(original);
    engine.post('coordinator', '@reader explicitly recover');
    await engine.wait(signal());
    const state = readSwarm(root, task.id);
    const member = state.members[0];
    expect(member.lastError).toBeUndefined();
    const exported = exportSwarmReports(root, task.id);
    const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
    const reports = manifest.reports.map((report: { file: string }) =>
      fs.readFileSync(
        path.join(path.dirname(exported.manifestPath), report.file),
        'utf8',
      ),
    );
    expect(reports).toEqual([
      'Accepted recovery',
      original,
      'Member turn did not complete.\n' + partial,
    ]);
    expect(manifest.reports[2].label).toContain('failed attempt');
    expect(manifest.reports[2].label).toContain('not a current verdict');
    expect(state.budget).toMatchObject({ turns: 3, failedTurns: 1 });
    const model = swarmModelSnapshot(root, task.id).members[0];
    expect(model.failedAttempts).toMatchObject({
      count: 1,
      historicalOnly: true,
    });
    expect(prompts[2]).toContain('failedAttempts');
    if (long) expect(prompts[2]).not.toContain(partial);
    const index = JSON.parse(
      fs.readFileSync(model.failedAttempts!.indexPath, 'utf8'),
    );
    expect(index.entries[0].turn).toBe(2);
    expect(fs.readFileSync(index.entries[0].file, 'utf8')).toBe(
      'Member turn did not complete.\n' + partial,
    );
  },
);

it('retains a thrown failure in the history after a successful correction', async () => {
  const task = createSwarm(root, 'Keep full transport diagnostics');
  let calls = 0;
  const diagnostic =
    'TRANSPORT_START\n' + 'Long diagnostic\n'.repeat(1500) + 'TRANSPORT_TAIL';
  const engine = getSwarmEngine(root, task.id, async () => {
    if (++calls === 2) throw new Error(diagnostic);
    return { completed: true, text: calls === 1 ? 'Original' : 'Recovered' };
  });
  engine.add('reader', 'researcher', 'Read only');
  await engine.wait(signal());
  engine.post('coordinator', '@reader next');
  await engine.wait(signal());
  engine.post('coordinator', '@reader explicitly correct');
  await engine.wait(signal());
  const exported = exportSwarmReports(root, task.id);
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
  const texts = manifest.reports.map((report: { file: string }) =>
    fs.readFileSync(
      path.join(path.dirname(exported.manifestPath), report.file),
      'utf8',
    ),
  );
  expect(texts).toEqual(['Recovered', 'Original', diagnostic]);
  expect(readSwarm(root, task.id).budget.failedTurns).toBe(1);
});

it.each(['changed', 'missing'] as const)(
  'refuses complete export of %s failed evidence without altering current results',
  async (damage) => {
    const task = createSwarm(root, 'Keep failed evidence verifiable');
    let calls = 0;
    const engine = getSwarmEngine(root, task.id, async () => ({
      completed: ++calls !== 2,
      text: calls === 2 ? 'Failed full evidence' : 'Accepted evidence',
    }));
    engine.add('reader', 'researcher', 'Read only');
    await engine.wait(signal());
    engine.post('coordinator', '@reader next');
    await engine.wait(signal());
    const model = swarmModelSnapshot(root, task.id).members[0];
    expect(model.failedAttempts).toBeDefined();
    const index = JSON.parse(
      fs.readFileSync(model.failedAttempts!.indexPath, 'utf8'),
    );
    const archive = swarmResultArchivePath(root, task.id, index.entries[0]);
    if (damage === 'changed') fs.writeFileSync(archive, 'External edit');
    else fs.unlinkSync(archive);
    const stateFile = path.join(root, 'swarms', task.id, 'members.json');
    const before = fs.readFileSync(stateFile);
    expect(() => exportSwarmReports(root, task.id)).toThrow(
      'missing or changed',
    );
    expect(fs.readFileSync(stateFile)).toEqual(before);
    expect(
      readSwarmResultText(root, task.id, readSwarm(root, task.id).members[0]),
    ).toBe('Accepted evidence');
  },
);
