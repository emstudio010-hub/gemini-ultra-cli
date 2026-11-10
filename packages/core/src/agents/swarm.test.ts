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
  currentSwarmActor,
  postSwarmMessage,
  resumeSwarm,
} from './swarm.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
const signal = () => new AbortController().signal;

it('posts publicly under native member identity and only wakes an idle peer on an exact mention', async () => {
  const swarm = createSwarm(root, 'Investigate two questions');
  const turns: string[] = [];
  const engine = getSwarmEngine(root, swarm.id, async () => {
    const actor = currentSwarmActor()!;
    turns.push(actor.name);
    postSwarmMessage(
      actor.root,
      actor.id,
      actor.name,
      `Evidence from ${actor.name}`,
    );
    return { completed: true, text: 'Evidence retained.' };
  });
  engine.add('alpha', 'researcher', 'Read the first source only.');
  engine.add('beta', 'researcher', 'Read the second source only.');
  await engine.wait(signal());
  expect(turns.sort()).toEqual(['alpha', 'beta']);
  engine.post('coordinator', '@alphabet and @alpha_extra do not target alpha');
  await engine.wait(signal());
  expect(turns).toHaveLength(2);
  engine.post('coordinator', '@beta review new information');
  await engine.wait(signal());
  expect(turns).toEqual(['alpha', 'beta', 'beta']);
  const board = readSwarmBoard(root, swarm.id);
  expect(board.map((post) => post.seq)).toEqual(
    board.map((_, index) => index + 1),
  );
  expect(
    board.some(
      (post) => post.sender === 'beta' && post.text === 'Evidence from beta',
    ),
  ).toBe(true);
  expect(
    readSwarm(root, swarm.id).members.every(
      (member) => member.state === 'waiting',
    ),
  ).toBe(true);
});

it('serializes actual writer turns and invalidates an old verifier after a member changes the work', async () => {
  const swarm = createSwarm(root, 'Assemble the deliverable');
  let writers = 0;
  let maxWriters = 0;
  const artifact = path.join(root, 'deliverable.txt');
  const engine = getSwarmEngine(root, swarm.id, async (agent) => {
    if (agent === 'coder') {
      writers++;
      maxWriters = Math.max(maxWriters, writers);
      await Promise.resolve();
      fs.appendFileSync(artifact, currentSwarmActor()!.name + '\n');
      writers--;
      return { completed: true, text: 'Saved scoped changes.' };
    }
    return {
      completed: true,
      text: JSON.stringify({
        passed: fs.readFileSync(artifact, 'utf8').includes('alpha\nbeta\n'),
        summary: 'Read the current artifact.',
        evidence: [artifact],
      }),
    };
  });
  engine.add('alpha', 'coder', 'Append the alpha section.');
  engine.add('beta', 'coder', 'Append the beta section.');
  engine.add(
    'verifier',
    'workflow-auditor',
    'Read both sections independently.',
  );
  await engine.wait(signal());
  expect(maxWriters).toBe(1);
  engine.post('coordinator', '@alpha make the requested correction');
  expect(() => engine.finish()).toThrow();
  await engine.wait(signal());
  expect(() => engine.finish()).toThrow('current independent verifier');
  engine.post('coordinator', '@verifier inspect the updated artifact');
  await engine.wait(signal());
  engine.finish();
  expect(readSwarm(root, swarm.id).phase).toBe('completed');
});

it('pauses a malformed verifier and preserves killed members and the append-only board on cancellation', async () => {
  const swarm = createSwarm(root, 'Review the deliverable');
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: 'Everything looks fine.',
  }));
  engine.add(
    'verifier',
    'workflow-auditor',
    'Return an evidence-backed verdict.',
  );
  await engine.wait(signal());
  expect(readSwarm(root, swarm.id).members[0].state).toBe('paused');
  expect(() => engine.finish()).toThrow();
  engine.remove('verifier');
  expect(() => engine.add('verifier', 'researcher', 'Try to revive.')).toThrow(
    'already used',
  );
  const board = fs.readFileSync(
    path.join(root, 'swarms', swarm.id, 'board.jsonl'),
    'utf8',
  );
  engine.cancel();
  expect(() => engine.post('coordinator', '@all restart')).toThrow('cancelled');
  expect(readSwarm(root, swarm.id).members[0].state).toBe('killed');
  expect(
    fs.readFileSync(path.join(root, 'swarms', swarm.id, 'board.jsonl'), 'utf8'),
  ).toBe(board);
  await resumeSwarm(root, swarm.id);
  expect(readSwarm(root, swarm.id).phase).toBe('active');
  expect(readSwarm(root, swarm.id).members[0].state).toBe('killed');
});
