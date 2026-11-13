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
  swarmModelSnapshot,
} from './swarm.js';
import {
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';
import { exportSwarmReports } from './agentReports.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-prior-results-'));
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
it.each([false, true])(
  'preserves superseded long=%s results verbatim across three successful turns',
  async (long) => {
    const original =
      'EARLY_EVIDENCE\n' +
      '完整证据 '.repeat(long ? 4000 : 1400) +
      '\nEARLY_TAIL';
    const middle = 'SECOND_SAVED_RESULT\nIndependent correction';
    const latest = 'CURRENT_RESULT\nLatest evidence';
    const outputs = [original, middle, latest];
    const task = createSwarm(
      root,
      'Keep evidence from every successful member turn',
    );
    let calls = 0;
    const engine = getSwarmEngine(root, task.id, async () => ({
      completed: true,
      text: outputs[calls++],
    }));
    engine.add('reader', 'researcher', 'Read only; preserve prior findings');
    await engine.wait(new AbortController().signal);
    for (let round = 0; round < 2; round++) {
      engine.post(
        'coordinator',
        '@reader explicitly inspect the next question',
      );
      await engine.wait(new AbortController().signal);
    }
    expect(calls).toBe(3);
    const state = readSwarm(root, task.id);
    expect(readSwarmResultText(root, task.id, state.members[0])).toBe(latest);
    const file = path.join(root, 'swarms', task.id, 'members.json');
    const before = fs.readFileSync(file);
    const exported = exportSwarmReports(root, task.id);
    expect(exported.reportCount).toBe(3);
    const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
    const texts = manifest.reports.map((report: { file: string }) =>
      fs.readFileSync(
        path.join(path.dirname(exported.manifestPath), report.file),
        'utf8',
      ),
    );
    expect(texts).toEqual([latest, original, middle]);
    expect(manifest.reports[1].label).toContain('historical');
    expect(state.budget).toMatchObject({ turns: 3, failedTurns: 0 });
    const model = swarmModelSnapshot(root, task.id).members[0];
    expect(model.previousResults).toMatchObject({
      count: 2,
      historicalOnly: true,
    });
    expect('pastResults' in model).toBe(false);
    const index = JSON.parse(
      fs.readFileSync(model.previousResults!.indexPath, 'utf8'),
    );
    expect(index.entries).toHaveLength(2);
    expect(
      index.entries.map((entry: { beforeTurn: number }) => entry.beforeTurn),
    ).toEqual([2, 3]);
    expect(fs.readFileSync(index.entries[0].file, 'utf8')).toBe(original);
    expect(fs.readFileSync(index.entries[1].file, 'utf8')).toBe(middle);
    expect(fs.readFileSync(file)).toEqual(before);
  },
);

it.each(['changed', 'missing'] as const)(
  'keeps the current result and refuses complete export if a prior result is %s',
  async (damage) => {
    const task = createSwarm(root, 'Preserve superseded evidence');
    let calls = 0;
    const engine = getSwarmEngine(root, task.id, async () => ({
      completed: true,
      text: ++calls === 1 ? 'Original historical evidence' : 'Current evidence',
    }));
    engine.add('reader', 'researcher', 'Read evidence');
    await engine.wait(new AbortController().signal);
    engine.post('coordinator', '@reader explicitly continue');
    await engine.wait(new AbortController().signal);
    const state = readSwarm(root, task.id);
    const prior = swarmResultArchivePath(
      root,
      task.id,
      state.members[0].pastResults![0].fullResult,
    );
    if (damage === 'changed') fs.writeFileSync(prior, 'External change');
    else fs.unlinkSync(prior);
    const file = path.join(root, 'swarms', task.id, 'members.json');
    const before = fs.readFileSync(file);
    expect(() => exportSwarmReports(root, task.id)).toThrow(
      'missing or changed',
    );
    expect(
      readSwarmResultText(root, task.id, readSwarm(root, task.id).members[0]),
    ).toBe('Current evidence');
    expect(fs.readFileSync(file)).toEqual(before);
    if (damage === 'changed')
      expect(fs.readFileSync(prior, 'utf8')).toBe('External change');
    else expect(fs.existsSync(prior)).toBe(false);
  },
);

it('never substitutes a historical passing verdict for the current failed verdict', async () => {
  const task = createSwarm(root, 'Use only the current independent verdict');
  let calls = 0;
  const engine = getSwarmEngine(root, task.id, async () => ({
    completed: true,
    text: JSON.stringify({
      passed: ++calls === 1,
      summary: 'Inspected current fixture',
      evidence: ['Saved fixture evidence'],
    }),
  }));
  engine.add('verifier', 'workflow-auditor', 'Review independently');
  await engine.wait(new AbortController().signal);
  engine.post('coordinator', '@verifier explicitly recheck');
  await engine.wait(new AbortController().signal);
  const state = readSwarm(root, task.id);
  expect(state.members[0].pastResults).toHaveLength(1);
  expect(state.members[0].verifiedRevision).toBeUndefined();
  expect(
    JSON.parse(readSwarmResultText(root, task.id, state.members[0])).passed,
  ).toBe(false);
  expect(() => engine.finish()).toThrow('current independent verifier');
  const exported = exportSwarmReports(root, task.id);
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
  expect(manifest.reports).toHaveLength(2);
  expect(manifest.reports[1].label).toContain('not a current verdict');
  expect(
    JSON.parse(
      fs.readFileSync(
        path.join(
          path.dirname(exported.manifestPath),
          manifest.reports[1].file,
        ),
        'utf8',
      ),
    ).passed,
  ).toBe(true);
});
