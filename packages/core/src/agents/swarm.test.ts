/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  readSwarmBoard,
  currentSwarmActor,
  postSwarmMessage,
  resumeSwarm,
  setSwarmBudget,
  consumeSwarmRequest,
  SwarmEngine,
  cancelSavedSwarm,
  latestSwarm,
} from './swarm.js';
import { createAgentWorkflow } from './agentWorkflows.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
const signal = () => new AbortController().signal;

function savedFiles() {
  return Object.fromEntries(
    fs.readdirSync(root, { recursive: true }).flatMap((entry) => {
      const file = path.join(root, String(entry));
      return fs.statSync(file).isFile()
        ? [[String(entry), fs.readFileSync(file)]]
        : [];
    }),
  );
}

it.each(['full', 'overflow', 'damaged'] as const)(
  'refuses historical resume with a %s board before changing task state or binding',
  async (damage) => {
    const older = createSwarm(root, 'Preserve the cancelled historical task');
    consumeSwarmRequest(root);
    cancelSavedSwarm(root, older.id);
    const newer = createSwarm(root, 'Keep the current terminal binding');
    cancelSavedSwarm(root, newer.id);
    const file = path.join(root, 'swarms', older.id, 'board.jsonl');
    const post = {
      seq: 1,
      sender: 'coordinator',
      text: 'Saved evidence',
      time: '2026-11-12T00:00:00.000Z',
    };
    if (damage === 'full')
      fs.writeFileSync(
        file,
        Array.from(
          { length: 500 },
          (_, index) => JSON.stringify({ ...post, seq: index + 1 }) + '\n',
        ).join(''),
      );
    else if (damage === 'overflow') {
      post.text = '';
      post.text = 'x'.repeat(
        4 * 1024 * 1024 - 10 - Buffer.byteLength(JSON.stringify(post) + '\n'),
      );
      fs.writeFileSync(file, JSON.stringify(post) + '\n');
    } else fs.writeFileSync(file, '{original damaged board');
    const before = savedFiles();
    await expect(resumeSwarm(root, older.id)).rejects.toThrow();
    const after = savedFiles();
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const [name, bytes] of Object.entries(before))
      expect(after[name].equals(bytes), `Saved file changed: ${name}`).toBe(
        true,
      );
    expect(readSwarm(root, older.id)).toMatchObject({
      phase: 'cancelled',
      budget: { requests: 1 },
    });
    expect(latestSwarm(root)?.id).toBe(newer.id);
  },
);

it('resumes at the final available board slot without dropping saved posts or resetting usage', async () => {
  const swarm = createSwarm(root, 'Use the final allowed resume post');
  consumeSwarmRequest(root);
  cancelSavedSwarm(root, swarm.id);
  const file = path.join(root, 'swarms', swarm.id, 'board.jsonl');
  const original = Array.from(
    { length: 499 },
    (_, index) =>
      JSON.stringify({
        seq: index + 1,
        sender: 'coordinator',
        text: 'Earlier evidence',
        time: '2026-11-12T00:00:00.000Z',
      }) + '\n',
  ).join('');
  fs.writeFileSync(file, original);
  await resumeSwarm(root, swarm.id);
  expect(latestSwarm(root)).toMatchObject({
    id: swarm.id,
    phase: 'active',
    budget: { requests: 1 },
  });
  expect(fs.readFileSync(file, 'utf8').startsWith(original)).toBe(true);
  expect(readSwarmBoard(root, swarm.id)).toHaveLength(500);
  expect(readSwarmBoard(root, swarm.id).at(-1)).toMatchObject({
    seq: 500,
    text: expect.stringContaining('Explicitly resumed'),
  });
});

it('rebinds an explicitly resumed historical swarm while preserving its cumulative usage and the newer terminal task', async () => {
  const older = createSwarm(root, 'Resume this historical swarm');
  consumeSwarmRequest(root);
  cancelSavedSwarm(root, older.id);
  const newer = createSwarm(root, 'Leave this newer cancelled swarm intact');
  cancelSavedSwarm(root, newer.id);
  const newerFiles = Object.fromEntries(
    Object.entries(savedFiles()).filter(([file]) => file.includes(newer.id)),
  );
  await resumeSwarm(root, older.id);
  expect(latestSwarm(root)).toMatchObject({
    id: older.id,
    phase: 'active',
    budget: { requests: 1 },
  });
  for (const [file, bytes] of Object.entries(newerFiles))
    expect(fs.readFileSync(path.join(root, file))).toEqual(bytes);
});

it.each([false, true])(
  'refuses resume promptly while members are running with cancellation=%s, without waiting or changing saved state',
  async (cancelled) => {
    const swarm = createSwarm(
      root,
      'Keep local resume responsive during member work',
    );
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let childSignal: AbortSignal | undefined;
    let calls = 0;
    const engine = getSwarmEngine(
      root,
      swarm.id,
      async (_agent, _prompt, signal) => {
        calls++;
        childSignal = signal;
        started();
        await gate;
        return { completed: true, text: 'Generated member output' };
      },
    );
    engine.add('reader', 'researcher', 'Wait for a bounded fixture release');
    await start;
    if (cancelled) cancelSavedSwarm(root, swarm.id);
    const before = savedFiles();
    let result: { error?: unknown; completed?: boolean } | undefined;
    const resuming = resumeSwarm(root, swarm.id).then(
      () => {
        result = { completed: true };
      },
      (error: unknown) => {
        result = { error };
      },
    );
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(result?.error).toBeInstanceOf(Error);
      expect((result?.error as Error).message).toMatch(/swarm status/);
      expect(savedFiles()).toEqual(before);
      expect(calls).toBe(1);
      expect(childSignal?.aborted).toBe(cancelled);
      release();
      await engine.wait(signal());
      await resuming;
      await resumeSwarm(root, swarm.id);
      expect(latestSwarm(root)?.phase).toBe('active');
      expect(readSwarm(root, swarm.id).budget).toMatchObject({
        turns: 1,
        failedTurns: 0,
      });
    } finally {
      engine.cancel();
      release();
      await engine.wait(signal());
      await resuming;
    }
  },
);

it.each(['active', 'blocked'] as const)(
  'refuses historical resume while a different swarm is %s without mutating either task',
  async (phase) => {
    const older = createSwarm(root, 'Historical swarm');
    cancelSavedSwarm(root, older.id);
    const newer = createSwarm(root, 'Pending current swarm');
    const file = path.join(root, 'swarms', newer.id, 'members.json');
    fs.writeFileSync(file, JSON.stringify({ ...newer, phase }));
    const before = savedFiles();
    await expect(resumeSwarm(root, older.id)).rejects.toThrow('pending swarm');
    expect(savedFiles()).toEqual(before);
  },
);

it('refuses swarm resume while a workflow budget is open and preserves both records', async () => {
  const older = createSwarm(root, 'Historical swarm');
  cancelSavedSwarm(root, older.id);
  createAgentWorkflow(root, 'teamwork', 'Pending workflow', 'default');
  const before = savedFiles();
  await expect(resumeSwarm(root, older.id)).rejects.toThrow('pending workflow');
  expect(savedFiles()).toEqual(before);
});

it('does not change ownership, records or bindings when a dead-owner swarm still has exhausted budget', async () => {
  const older = createSwarm(root, 'Depleted historical swarm');
  cancelSavedSwarm(root, older.id);
  const file = path.join(root, 'swarms', older.id, 'members.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...readSwarm(root, older.id),
      ownerPid: Number(
        execFileSync(
          process.execPath,
          ['-e', 'process.stdout.write(String(process.pid))'],
          { encoding: 'utf8', windowsHide: true },
        ),
      ),
      budget: { ...older.budget, requests: older.budget.maxRequests },
    }),
  );
  const before = savedFiles();
  await expect(resumeSwarm(root, older.id)).rejects.toThrow('still exhausted');
  expect(savedFiles()).toEqual(before);
});

it('keeps a completed historical swarm local even with another open workflow and a damaged binding', async () => {
  const older = createSwarm(root, 'Completed historical swarm');
  const file = path.join(root, 'swarms', older.id, 'members.json');
  fs.writeFileSync(file, JSON.stringify({ ...older, phase: 'completed' }));
  createAgentWorkflow(root, 'teamwork', 'Pending workflow', 'default');
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{damaged binding');
  const before = savedFiles();
  await resumeSwarm(root, older.id);
  expect(savedFiles()).toEqual(before);
});

it('blocks after two failed turns across renamed members and retains spent limits across cancel/resume', async () => {
  const swarm = createSwarm(root, 'Bound the failing task');
  let calls = 0;
  const engine = getSwarmEngine(root, swarm.id, async () => {
    calls++;
    return { completed: false, text: 'Output token limit reached.' };
  });
  engine.add('author', 'coder', 'Deliver a report');
  await engine.wait(signal());
  engine.remove('author');
  engine.add('replacement', 'coder', 'Deliver the same report');
  await engine.wait(signal());
  expect(calls).toBe(2);
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'blocked',
    budget: { failedTurns: 2, turns: 2 },
  });
  expect(() => engine.add('third', 'coder', 'Try again')).toThrow('blocked');
  expect(() => engine.finish()).toThrow('blocked');
  await expect(resumeSwarm(root, swarm.id)).rejects.toThrow('still exhausted');
  engine.cancel();
  await expect(resumeSwarm(root, swarm.id)).rejects.toThrow('still exhausted');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 120,
    maxFailedTurns: 3,
    maxTurns: 40,
  });
  await resumeSwarm(root, swarm.id);
  expect(readSwarm(root, swarm.id).budget.failedTurns).toBe(2);
  engine.post('coordinator', '@replacement One user-authorized correction');
  await engine.wait(signal());
  expect(calls).toBe(3);
  expect(readSwarm(root, swarm.id).phase).toBe('blocked');
});

it('counts successful turns task-wide and migrates legacy spent turns without resetting them', async () => {
  const swarm = createSwarm(root, 'Bound successful chatter');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 10,
    maxFailedTurns: 2,
    maxTurns: 1,
  });
  const runner = async () => ({ completed: true, text: 'Read source.' });
  const engine = getSwarmEngine(root, swarm.id, runner);
  engine.add('reader', 'researcher', 'Read once');
  await engine.wait(signal());
  const recovered = new SwarmEngine(root, swarm.id, runner);
  recovered.add('replacement', 'researcher', 'Read again');
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'blocked',
    budget: { turns: 1 },
  });

  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  const legacy = { ...readSwarm(root, swarm.id), budget: undefined };
  legacy.budgetVersion = undefined;
  fs.rmSync(path.join(root, 'swarms', swarm.id, 'owner.json'));
  fs.writeFileSync(file, JSON.stringify(legacy));
  expect(readSwarm(root, swarm.id).budget.turns).toBe(1);
});

it('aborts a concurrently running peer when the shared failure allowance is exhausted', async () => {
  const swarm = createSwarm(root, 'Stop peers on exhaustion');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 10,
    maxFailedTurns: 1,
    maxTurns: 10,
  });
  let peerAborted = false;
  const engine = getSwarmEngine(
    root,
    swarm.id,
    async (_agent, _prompt, memberSignal) => {
      if (currentSwarmActor()!.name === 'slow') {
        await new Promise<void>((resolve) =>
          memberSignal.addEventListener(
            'abort',
            () => {
              peerAborted = true;
              resolve();
            },
            { once: true },
          ),
        );
        return { completed: false, text: 'Peer cancelled.' };
      }
      return { completed: false, text: 'Concrete provider failure.' };
    },
  );
  engine.add('slow', 'researcher', 'Wait for cancellation');
  engine.add('failing', 'researcher', 'Fail once');
  await engine.wait(signal());
  expect(peerAborted).toBe(true);
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'blocked',
    budget: { failedTurns: 1 },
  });
});

it('reserves cumulative main dispatches and stops a native member before another provider call', async () => {
  const swarm = createSwarm(root, 'Share model dispatches');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 2,
    maxFailedTurns: 2,
    maxTurns: 10,
  });
  consumeSwarmRequest(root);
  let dispatched = false;
  const engine = getSwarmEngine(root, swarm.id, async () => {
    consumeSwarmRequest(undefined); // Native actor carries the project/id through AsyncLocalStorage.
    consumeSwarmRequest(undefined);
    dispatched = true;
    return { completed: true, text: 'Should not run.' };
  });
  // The member's second dispatch is denied after main + member share two reservations.
  engine.add('author', 'coder', 'Continue');
  await engine.wait(signal());
  expect(dispatched).toBe(false);
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'blocked',
    budget: { requests: 2 },
  });
  expect(() => consumeSwarmRequest(root)).toThrow('budget exhausted');
  engine.cancel();
  expect(() => consumeSwarmRequest(root)).not.toThrow();
});

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
