/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  readSwarmBoard,
  swarmModelSnapshot,
  swarmSnapshot,
} from './swarm.js';
import { exportSwarmReports } from './agentReports.js';
import {
  saveSwarmResultText,
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';

let root: string;
const text =
  '开头证据\n' +
  '证据记录 '.repeat(4200) +
  '\nAFTER_12000_CRITICAL_FINDING\n' +
  '尾部证据 '.repeat(1000);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-full-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
async function deliver(completed = true) {
  const swarm = createSwarm(root, 'Preserve full member evidence');
  let handoff = '';
  const engine = getSwarmEngine(root, swarm.id, async (_agent, prompt) => {
    if (prompt.includes('member @reader')) return { completed, text };
    const results = JSON.parse(
      prompt
        .split(
          'Current member results (including your prior result, if any):\n',
        )[1]
        .split('\nShared board')[0],
    );
    handoff = fs.readFileSync(results[0].result.fullText, 'utf8');
    expect(handoff).toBe(text);
    return { completed: true, text: 'Read full evidence' };
  });
  engine.add('reader', 'researcher', 'Read local evidence');
  await engine.wait(new AbortController().signal);
  engine.add('author', 'coder', 'Use all evidence');
  await engine.wait(new AbortController().signal);
  return { swarm: readSwarm(root, swarm.id), handoff };
}

it.each([true, false])(
  'preserves full successful=%s member text in native handoffs and local exports without expanding member state',
  async (completed) => {
    const { swarm, handoff } = await deliver(completed);
    expect(handoff).toContain('AFTER_12000_CRITICAL_FINDING');
    expect(swarm.members[0].state).toBe(completed ? 'waiting' : 'paused');
    const state = path.join(root, 'swarms', swarm.id, 'members.json');
    const before = fs.readFileSync(state);
    expect(before.length).toBeLessThan(12000);
    const snapshot = swarmModelSnapshot(root, swarm.id);
    expect(snapshot.members[0].result).toMatchObject({
      truncated: true,
      chars: text.length,
    });
    const file = snapshot.members[0].result.fullText!;
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
    expect(swarmSnapshot(root, swarm.id).members[0].result.length).toBeLessThan(
      2001,
    );
    const exported = exportSwarmReports(root, swarm.id);
    const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
    const report = manifest.reports[0];
    const actual = fs.readFileSync(
      path.join(path.dirname(exported.manifestPath), report.file),
      'utf8',
    );
    expect(actual).toBe(text);
    expect(report.sha256).toBe(createHash('sha256').update(text).digest('hex'));
    expect(fs.readFileSync(state)).toEqual(before);
    expect(readSwarmBoard(root, swarm.id).length).toBeGreaterThan(1);
  },
);

it('refuses changed full member evidence in context and exports while preserving the damaged file and original state', async () => {
  const { swarm } = await deliver();
  const file = swarmModelSnapshot(root, swarm.id).members[0].result.fullText!;
  const state = path.join(root, 'swarms', swarm.id, 'members.json');
  const before = fs.readFileSync(state);
  fs.writeFileSync(file, 'Changed outside runtime');
  expect(() => swarmModelSnapshot(root, swarm.id)).toThrow(
    'missing or changed',
  );
  expect(() => exportSwarmReports(root, swarm.id)).toThrow(
    'missing or changed',
  );
  expect(fs.readFileSync(file, 'utf8')).toBe('Changed outside runtime');
  expect(fs.readFileSync(state)).toEqual(before);
});

it('does not accept an oversized member result as a successful turn', async () => {
  const swarm = createSwarm(root, 'Reject oversized result explicitly');
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: 'x'.repeat(8 * 1024 * 1024 + 1),
  }));
  engine.add('reader', 'researcher', 'Return evidence');
  await engine.wait(new AbortController().signal);
  expect(readSwarm(root, swarm.id).members[0]).toMatchObject({
    state: 'paused',
    result: expect.stringContaining('8 MiB'),
  });
  expect(readSwarm(root, swarm.id).budget.failedTurns).toBe(1);
});

it.each(['missing', 'link'] as const)(
  'rejects a %s full-result file without replacing it with its preview',
  async (kind) => {
    const { swarm } = await deliver();
    const file = swarmModelSnapshot(root, swarm.id).members[0].result.fullText!;
    fs.unlinkSync(file);
    if (kind === 'link') {
      const other = path.join(root, 'other.md');
      fs.writeFileSync(other, text);
      fs.linkSync(other, file);
      // Hard links remain regular files with identical verified bytes. A mismatched
      // link target must still fail content validation without modifying either.
      fs.writeFileSync(other, 'Changed linked content');
    }
    expect(() => swarmModelSnapshot(root, swarm.id)).toThrow(
      'missing or changed',
    );
    expect(() => exportSwarmReports(root, swarm.id)).toThrow(
      'missing or changed',
    );
  },
);

it('retains a prior immutable archive while replacing a long result with a short later turn', async () => {
  const swarm = createSwarm(root, 'Retain past archived evidence');
  let round = 0;
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: round++ ? 'Short current result' : text,
  }));
  engine.add('reader', 'researcher', 'Read scoped evidence');
  await engine.wait(new AbortController().signal);
  const first = readSwarm(root, swarm.id).members[0];
  const file = swarmResultArchivePath(root, swarm.id, first.fullResult!);
  engine.post('coordinator', '@reader Inspect a changed input');
  await engine.wait(new AbortController().signal);
  const current = readSwarm(root, swarm.id).members[0];
  expect(current.result).toBe('Short current result');
  expect(current.fullResult).toBeUndefined();
  expect(readSwarmResultText(root, swarm.id, current)).toBe(
    'Short current result',
  );
  expect(fs.readFileSync(file, 'utf8')).toBe(text);
});

it('reuses matching immutable result archives and keeps legacy inline results readable', () => {
  const swarm = createSwarm(root, 'Reuse accepted text');
  const saved = saveSwarmResultText(root, swarm.id, text);
  expect(saveSwarmResultText(root, swarm.id, text)).toEqual(saved);
  expect(readSwarmResultText(root, swarm.id, saved)).toBe(text);
  expect(
    readSwarmResultText(root, swarm.id, { result: 'Legacy retained evidence' }),
  ).toBe('Legacy retained evidence');
});

it('refuses same-size archive changes by digest and refuses to overwrite their content', () => {
  const swarm = createSwarm(root, 'Verify archive content identity');
  const saved = saveSwarmResultText(root, swarm.id, text);
  const file = swarmResultArchivePath(root, swarm.id, saved.fullResult!);
  const changed = '改' + text.slice(1);
  expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(text));
  fs.writeFileSync(file, changed);
  expect(() => readSwarmResultText(root, swarm.id, saved)).toThrow(
    'missing or changed',
  );
  expect(() => saveSwarmResultText(root, swarm.id, text)).toThrow(
    'missing or changed',
  );
  expect(fs.readFileSync(file, 'utf8')).toBe(changed);
});

it('cannot finish after accepted member evidence changes even with a current independent verdict', async () => {
  const swarm = createSwarm(root, 'Keep accepted evidence through completion');
  const engine = getSwarmEngine(root, swarm.id, async (agent) => ({
    completed: true,
    text:
      agent === 'workflow-auditor'
        ? JSON.stringify({
            passed: true,
            summary: 'Inspected evidence',
            evidence: ['result archive'],
          })
        : text,
  }));
  engine.add('reader', 'researcher', 'Read source');
  await engine.wait(new AbortController().signal);
  engine.add('verifier', 'workflow-auditor', 'Inspect the complete evidence');
  await engine.wait(new AbortController().signal);
  const record = readSwarm(root, swarm.id);
  expect(record.members[1].verifiedRevision).toBe(record.revision);
  const file = swarmResultArchivePath(
    root,
    swarm.id,
    record.members[0].fullResult!,
  );
  fs.writeFileSync(file, 'Changed after review');
  const before = fs.readFileSync(
    path.join(root, 'swarms', swarm.id, 'members.json'),
  );
  expect(() => engine.finish()).toThrow('missing or changed');
  expect(
    fs.readFileSync(path.join(root, 'swarms', swarm.id, 'members.json')),
  ).toEqual(before);
  expect(readSwarm(root, swarm.id).phase).toBe('active');
});
