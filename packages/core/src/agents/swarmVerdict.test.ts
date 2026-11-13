/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  readSwarmBoard,
} from './swarm.js';
import {
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-verdict-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  ['plain text', 'RAW_REVIEW_FINDING: incomplete JSON, inspect fixture.md'],
  [
    'long malformed JSON',
    '{"passed":true,"summary":"' + 'RAW_REVIEW_DETAIL '.repeat(900),
  ],
  [
    'invalid shape',
    JSON.stringify({
      passed: true,
      summary: 'Observed fixture.md',
      evidence: [],
    }),
  ],
  [
    'blank summary',
    JSON.stringify({
      passed: true,
      summary: ' \n\t ',
      evidence: ['fixture.md checked'],
    }),
  ],
  [
    'blank evidence',
    JSON.stringify({
      passed: true,
      summary: 'Observed fixture.md',
      evidence: [' \n\t '],
    }),
  ],
])(
  'retains an invalid %s reviewer output without authorizing completion',
  async (_kind, text) => {
    const swarm = createSwarm(root, 'Review actual artifacts before finishing');
    const engine = getSwarmEngine(root, swarm.id, async () => ({
      completed: true,
      text,
    }));
    engine.add(
      'reviewer',
      'workflow-auditor',
      'Independently inspect fixture.md',
    );
    await engine.wait(new AbortController().signal);
    const saved = readSwarm(root, swarm.id);
    const member = saved.members[0];
    expect(readSwarmResultText(root, swarm.id, member)).toBe(text);
    expect(member.state).toBe('paused');
    expect(member.verifiedRevision).toBeUndefined();
    expect(member.lastError).toContain('invalid verdict');
    expect(readSwarmBoard(root, swarm.id).at(-1)?.text).toContain(
      'invalid verdict',
    );
    expect(saved.budget).toMatchObject({ turns: 1, failedTurns: 1 });
    expect(() => engine.finish()).toThrow(/paused/);
  },
);

it.each([false, true])(
  'keeps a valid passed=%s review distinct from invalid output',
  async (passed) => {
    const text = JSON.stringify({
      passed,
      summary: 'Checked fixture.md',
      evidence: ['Exact fixture line was checked'],
    });
    const swarm = createSwarm(root, 'Require a valid independent verdict');
    const engine = getSwarmEngine(root, swarm.id, async () => ({
      completed: true,
      text,
    }));
    engine.add(
      'reviewer',
      'workflow-auditor',
      'Inspect fixture.md independently',
    );
    await engine.wait(new AbortController().signal);
    const saved = readSwarm(root, swarm.id);
    const member = saved.members[0];
    expect(member.state).toBe('waiting');
    expect(member.result).toBe(text);
    expect(member.lastError).toBeUndefined();
    expect(saved.budget.failedTurns).toBe(passed ? 0 : 1);
    if (passed) {
      expect(member.verifiedRevision).toBe(saved.revision);
      engine.finish();
      expect(readSwarm(root, swarm.id).phase).toBe('completed');
    } else {
      expect(member.verifiedRevision).toBeUndefined();
      expect(() => engine.finish()).toThrow(/verdict/);
    }
  },
);

it('retains the malformed archive through an explicitly requested corrected review', async () => {
  const raw = 'RAW_REVIEW_DETAIL '.repeat(900);
  const swarm = createSwarm(
    root,
    'Preserve invalid review while awaiting an authorized correction',
  );
  let turns = 0;
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text:
      ++turns === 1
        ? raw
        : JSON.stringify({
            passed: true,
            summary: 'Checked fixture.md',
            evidence: ['Observed fixture.md line'],
          }),
  }));
  engine.add(
    'reviewer',
    'workflow-auditor',
    'Inspect fixture.md independently',
  );
  await engine.wait(new AbortController().signal);
  const prior = readSwarm(root, swarm.id).members[0];
  const archive = swarmResultArchivePath(root, swarm.id, prior.fullResult!);
  expect(turns).toBe(1);
  expect(fs.readFileSync(archive, 'utf8')).toBe(raw);
  expect(() => engine.finish()).toThrow(/paused/);
  engine.post(
    'coordinator',
    '@reviewer explicitly correct the verdict format after inspecting the saved output',
  );
  await engine.wait(new AbortController().signal);
  engine.finish();
  expect(turns).toBe(2);
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'completed',
    budget: { turns: 2, failedTurns: 1 },
  });
  expect(fs.readFileSync(archive, 'utf8')).toBe(raw);
});

it('does not trust a saved approval marker when its verdict is blank or invalid', async () => {
  const swarm = createSwarm(
    root,
    'Recheck the saved verdict at final completion',
  );
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: JSON.stringify({
      passed: true,
      summary: 'Original valid review',
      evidence: ['fixture.md'],
    }),
  }));
  engine.add('reviewer', 'workflow-auditor', 'Independently review fixture.md');
  await engine.wait(new AbortController().signal);
  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  const saved = readSwarm(root, swarm.id);
  expect(saved.members[0].verifiedRevision).toBe(saved.revision);
  // Model the legacy record that accepted whitespace without changing its
  // current revision marker or claiming a new independent review occurred.
  saved.members[0].result = JSON.stringify({
    passed: true,
    summary: ' ',
    evidence: [' '],
  });
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  const before = fs.readFileSync(file);
  expect(() => engine.finish()).toThrow(/verdict/);
  expect(fs.readFileSync(file)).toEqual(before);
  expect(readSwarm(root, swarm.id).phase).toBe('active');
});
