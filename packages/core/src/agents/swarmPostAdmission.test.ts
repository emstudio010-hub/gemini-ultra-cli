/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { lockSync } from 'proper-lockfile';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSwarm,
  readSwarm,
  readSwarmBoard,
  SwarmEngine,
} from './swarm.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-post-admission-'));
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const swarm = createSwarm(root, 'Keep lifecycle failures consistent');
  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.members = [
    {
      name: 'reader',
      agent: 'researcher',
      brief: 'Saved evidence',
      state: 'waiting',
      result: 'Original member result',
    },
    {
      name: 'verifier',
      agent: 'workflow-auditor',
      brief: 'Saved review',
      state: 'waiting',
      verifiedRevision: state.revision,
      result: JSON.stringify({
        passed: true,
        summary: 'Inspected original evidence',
        evidence: ['Original member result'],
      }),
    },
  ];
  fs.writeFileSync(file, JSON.stringify(state));
  const runner = vi.fn(async () => ({ completed: true, text: 'Not expected' }));
  const engine = new SwarmEngine(root, swarm.id, runner);
  const board = path.join(root, 'swarms', swarm.id, 'board.jsonl');
  return { swarm, engine, board, runner };
}
function savedFiles(): Record<string, Buffer> {
  return Object.fromEntries(
    fs.readdirSync(root, { recursive: true }).flatMap((entry) => {
      const file = path.join(root, String(entry));
      return fs.statSync(file).isFile()
        ? [[String(entry), fs.readFileSync(file)]]
        : [];
    }),
  );
}
function posts(count: number) {
  return Array.from(
    { length: count },
    (_, index) =>
      JSON.stringify({
        seq: index + 1,
        sender: 'coordinator',
        text: 'Preserved history',
        time: '2026-11-13T00:00:00.000Z',
      }) + '\n',
  ).join('');
}
const operations = ['add', 'remove', 'finish', 'review-post'] as const;
for (const operation of operations) {
  it.each(['full', 'overflow', 'damaged', 'locked'] as const)(
    `refuses ${operation} with a %s board before changing any task file`,
    (damage) => {
      const { swarm, engine, board, runner } = fixture();
      let release: (() => void) | undefined;
      if (damage === 'full') fs.writeFileSync(board, posts(500));
      if (damage === 'overflow') {
        const entry = {
          seq: 1,
          sender: 'coordinator',
          text: '',
          time: '2026-11-13T00:00:00.000Z',
        };
        entry.text = 'x'.repeat(
          4 * 1024 * 1024 -
            10 -
            Buffer.byteLength(JSON.stringify(entry) + '\n'),
        );
        fs.writeFileSync(board, JSON.stringify(entry) + '\n');
      }
      if (damage === 'damaged')
        fs.writeFileSync(board, '{original damaged board');
      if (damage === 'locked')
        release = lockSync(board, { realpath: false, retries: 0 });
      try {
        const before = savedFiles();
        expect(() => {
          if (operation === 'add')
            engine.add('newcomer', 'researcher', 'New scope');
          if (operation === 'remove') engine.remove('reader');
          if (operation === 'finish') engine.finish();
          if (operation === 'review-post')
            engine.post('coordinator', '@verifier inspect the changed scope', {
              name: 'verifier',
              files: ['new-scope.md'],
            });
        }).toThrow();
        const after = savedFiles();
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
        for (const [name, bytes] of Object.entries(before))
          expect(after[name].equals(bytes), `Saved file changed: ${name}`).toBe(
            true,
          );
        expect(readSwarm(root, swarm.id).phase).toBe('active');
        expect(runner).not.toHaveBeenCalled();
        expect(engine.hasRunningMembers()).toBe(false);
      } finally {
        release?.();
      }
    },
  );
}
it('still finishes and appends the final allowed post without discarding history', () => {
  const { swarm, engine, board, runner } = fixture();
  const before = posts(499);
  fs.writeFileSync(board, before);
  engine.finish();
  expect(readSwarm(root, swarm.id).phase).toBe('completed');
  expect(fs.readFileSync(board, 'utf8').startsWith(before)).toBe(true);
  const saved = readSwarmBoard(root, swarm.id);
  expect(saved).toHaveLength(500);
  expect(saved.at(-1)?.text).toContain('Swarm completed');
  expect(runner).not.toHaveBeenCalled();
});
