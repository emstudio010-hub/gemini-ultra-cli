/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  readSwarmBoard,
  swarmModelSnapshot,
  swarmSnapshot,
} from './swarm.js';
import { swarmContextSnapshot, swarmMemberContext } from './swarmContext.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-context-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('keeps omitted middle evidence readable across member turns without changing records or UI snapshots', async () => {
  const objective = 'Keep every user requirement. '.repeat(100).trim();
  const swarm = createSwarm(root, objective);
  const report = `${'start '.repeat(250)}MIDDLE_EVIDENCE=42${' end'.repeat(400)}`;
  const engine = getSwarmEngine(root, swarm.id, async (agent, prompt) => {
    if (agent === 'researcher') return { completed: true, text: report };
    expect(prompt.split(objective)).toHaveLength(2);
    expect(prompt).not.toContain('MIDDLE_EVIDENCE=42');
    const data = JSON.parse(
      prompt
        .split(
          'Current member results (including your prior result, if any):\n',
        )[1]
        .split('\nShared board')[0],
    );
    expect(fs.readFileSync(data[0].result.fullText, 'utf8')).toBe(report);
    expect(prompt).toContain('read its full result');
    return {
      completed: true,
      text: 'Used full report, including middle evidence.',
    };
  });
  engine.add('scout', 'researcher', objective);
  await engine.wait(new AbortController().signal);
  const stateFile = path.join(root, 'swarms', swarm.id, 'members.json');
  const boardFile = path.join(root, 'swarms', swarm.id, 'board.jsonl');
  const before = [fs.readFileSync(stateFile), fs.readFileSync(boardFile)];
  const publicView = swarmSnapshot(root, swarm.id);
  const modelView = swarmModelSnapshot(root, swarm.id);
  expect(modelView.members[0].result.truncated).toBe(true);
  expect(modelView.recentPosts[0]).toMatchObject({
    duplicateOf: expect.stringContaining('Objective above'),
  });
  expect(modelView.recentPosts.at(-1)).toMatchObject({
    duplicateOf: expect.stringContaining('@scout result'),
  });
  expect(modelView.budget).toEqual(publicView.budget);
  expect(swarmSnapshot(root, swarm.id)).toEqual(publicView);
  expect(fs.readFileSync(stateFile)).toEqual(before[0]);
  expect(fs.readFileSync(boardFile)).toEqual(before[1]);
  engine.add('author', 'coder', 'Distinct requirement: retain encoding.');
  await engine.wait(new AbortController().signal);
  const author = readSwarm(root, swarm.id).members[1];
  expect(author).toMatchObject({ state: 'waiting' });
});

it('preserves failed verdicts, accounting uncertainty, revisions and distinct board requirements', () => {
  const swarm = createSwarm(root, 'Original objective');
  const failed = JSON.stringify({
    passed: false,
    summary: 'x'.repeat(2000),
    evidence: ['MIDDLE_FAILURE', 'y'.repeat(1800)],
  });
  swarm.phase = 'blocked';
  swarm.stopReason = 'Failure budget exhausted';
  swarm.accountingUnknown = true;
  swarm.revision = 8;
  swarm.members.push({
    name: 'verifier',
    agent: 'workflow-auditor',
    brief: 'Independently inspect files',
    state: 'paused',
    lastRead: 2,
    turns: 1,
    result: failed,
    verifiedRevision: 7,
    modelsUsed: [],
  });
  const board = readSwarmBoard(root, swarm.id);
  board.push({
    seq: 2,
    sender: 'coordinator',
    text: 'Distinct new constraint: preserve UTF-8',
    time: 'now',
  });
  board.push({
    seq: 3,
    sender: 'verifier',
    text: `paused: ${failed}`.slice(0, 4000),
    time: 'now',
  });
  const view = swarmContextSnapshot(root, swarm, board);
  expect(view).toMatchObject({
    phase: 'blocked',
    stopReason: 'Failure budget exhausted',
    revision: 8,
    budget: { requests: null, failedTurns: null, turns: null },
  });
  expect(view.members[0]).toMatchObject({
    state: 'paused',
    turns: 1,
    verifiedRevision: 7,
    result: { truncated: true },
  });
  expect(fs.readFileSync(view.members[0].result.fullText!, 'utf8')).toBe(
    failed,
  );
  expect(view.recentPosts[1].text).toBe(board[1].text);
  const prompt = swarmMemberContext(root, swarm, swarm.members[0], board);
  expect(prompt).toContain('Distinct new constraint: preserve UTF-8');
  expect(prompt).toContain('not approve from previews');
});

it('reuses immutable mirrors, preserves older board results, and refuses externally changed mirrors', () => {
  const swarm = createSwarm(root, 'Task');
  const result = 'Current report'.repeat(200);
  swarm.members.push({
    name: 'scout',
    agent: 'researcher',
    brief: 'Distinct brief'.repeat(200),
    state: 'waiting',
    lastRead: 0,
    turns: 2,
    result,
    modelsUsed: [],
  });
  const board = [
    {
      seq: 1,
      sender: 'scout',
      text: 'waiting: Earlier result with different instructions',
      time: 'now',
    },
  ];
  const snapshot = swarmContextSnapshot(root, swarm, board);
  expect(snapshot.recentPosts[0].text).toBe(board[0].text);
  expect(swarmContextSnapshot(root, swarm, board)).toEqual(snapshot);
  const mirror = snapshot.members[0].result.fullText!;
  fs.writeFileSync(mirror, 'changed outside runtime');
  expect(() => swarmContextSnapshot(root, swarm, board)).toThrow(
    'mirror changed',
  );
  expect(fs.readFileSync(mirror, 'utf8')).toBe('changed outside runtime');
  expect(swarm.members[0].result).toBe(result);
});
