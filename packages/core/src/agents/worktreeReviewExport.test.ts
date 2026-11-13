/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  prepareAgentWorktree,
  agentWorktreeTree,
  acceptReviewedAgentWorktree,
  readAgentWorktree,
  applyAgentWorktree,
} from './agentWorktree.js';

const boundary = vi.hoisted(() => ({
  afterSnapshot: undefined as (() => void) | undefined,
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
      const result = actual.execFileSync(...args);
      if (
        args[0] === 'git' &&
        Array.isArray(args[1]) &&
        args[1].includes('write-tree') &&
        boundary.afterSnapshot
      ) {
        const callback = boundary.afterSnapshot;
        boundary.afterSnapshot = undefined;
        callback();
      }
      return result;
    },
  };
});

let scratch: string;
let source: string;
let root: string;
const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
beforeEach(() => {
  scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-worktree-review-export-'),
  );
  source = path.join(scratch, 'source');
  root = path.join(scratch, 'state');
  fs.mkdirSync(source);
  fs.mkdirSync(root);
  git(source, ['init', '--quiet']);
  git(source, ['config', 'user.name', 'Fixture']);
  git(source, ['config', 'user.email', 'fixture@invalid']);
  git(source, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(source, 'report.txt'), 'Original source\n');
  git(source, ['add', 'report.txt']);
  git(source, ['commit', '--quiet', '-m', 'fixture']);
});
afterEach(() => {
  boundary.afterSnapshot = undefined;
  expect(path.dirname(scratch)).toBe(os.tmpdir());
  expect(path.basename(scratch)).toMatch(/^ultra-worktree-review-export-/);
  fs.rmSync(scratch, { recursive: true, force: true });
});

it('never approves a second unreviewed export when files change after the acceptance snapshot', () => {
  const id = randomUUID();
  const state = prepareAgentWorktree(root, id, source);
  const artifact = path.join(state.directory, 'report.txt');
  fs.writeFileSync(artifact, 'Reviewed version A\n');
  const reviewed = agentWorktreeTree(root, id);
  const head = git(source, ['rev-parse', 'HEAD']);
  const index = fs.readFileSync(path.join(source, '.git/index'));
  boundary.afterSnapshot = () =>
    fs.writeFileSync(artifact, 'Unreviewed version B\n');
  // Capture the exact Git write-tree boundary, while running every Git command for real.
  expect(() => acceptReviewedAgentWorktree(root, id, reviewed)).toThrow(
    'changed during or after',
  );
  const accepted = readAgentWorktree(root, id)!;
  expect(accepted.acceptedTree).toBeUndefined();
  expect(accepted.result).toBe(reviewed);
  expect(fs.readFileSync(accepted.patch!, 'utf8')).toContain(
    'Reviewed version A',
  );
  expect(fs.readFileSync(accepted.patch!, 'utf8')).not.toContain(
    'Unreviewed version B',
  );
  expect(fs.readFileSync(artifact, 'utf8')).toBe('Unreviewed version B\n');
  expect(() => applyAgentWorktree(root, id)).toThrow('final review');
  expect(fs.readFileSync(path.join(source, 'report.txt'), 'utf8')).toBe(
    'Original source\n',
  );
  expect(git(source, ['rev-parse', 'HEAD'])).toBe(head);
  expect(fs.readFileSync(path.join(source, '.git/index'))).toEqual(index);
});

it('keeps approval bound to the reviewed export if files change after the final current-tree check', () => {
  const id = randomUUID();
  const state = prepareAgentWorktree(root, id, source);
  const artifact = path.join(state.directory, 'report.txt');
  fs.writeFileSync(artifact, 'Reviewed version A\n');
  const reviewed = agentWorktreeTree(root, id);
  boundary.afterSnapshot = () => {
    boundary.afterSnapshot = () =>
      fs.writeFileSync(artifact, 'Late version B\n');
  };
  acceptReviewedAgentWorktree(root, id, reviewed);
  const accepted = readAgentWorktree(root, id)!;
  expect(accepted.acceptedTree).toBe(reviewed);
  expect(accepted.result).toBe(reviewed);
  expect(fs.readFileSync(accepted.patch!, 'utf8')).toContain(
    'Reviewed version A',
  );
  expect(fs.readFileSync(artifact, 'utf8')).toBe('Late version B\n');
  expect(() => applyAgentWorktree(root, id)).toThrow('final review');
  expect(fs.readFileSync(path.join(source, 'report.txt'), 'utf8')).toBe(
    'Original source\n',
  );
});

it('rejects a different exported tree and only applies the exact reviewed result after explicit review', () => {
  const id = randomUUID();
  const state = prepareAgentWorktree(root, id, source);
  const artifact = path.join(state.directory, 'report.txt');
  fs.writeFileSync(artifact, 'Reviewed version A\n');
  const reviewed = agentWorktreeTree(root, id);
  fs.writeFileSync(artifact, 'Different version B\n');
  expect(() => acceptReviewedAgentWorktree(root, id, reviewed)).toThrow(
    'changed during or after',
  );
  expect(readAgentWorktree(root, id)?.acceptedTree).toBeUndefined();
  expect(() => applyAgentWorktree(root, id)).toThrow('final review');
  const current = agentWorktreeTree(root, id);
  acceptReviewedAgentWorktree(root, id, current);
  applyAgentWorktree(root, id);
  expect(fs.readFileSync(path.join(source, 'report.txt'), 'utf8')).toBe(
    'Different version B\n',
  );
});
