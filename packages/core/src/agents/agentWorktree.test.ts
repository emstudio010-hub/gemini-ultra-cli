/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  prepareAgentWorktree,
  inAgentWorktree,
  exportAgentWorktree,
  acceptAgentWorktree,
  applyAgentWorktree,
  removeAgentWorktree,
  acceptReviewedAgentWorktree,
  agentWorktreeTree,
} from './agentWorktree.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createAgentWorkflow, runAgentWorkflow } from './agentWorkflows.js';
import { withAgentWorkingDirectory } from '../config/scoped-config.js';

let scratch: string;
let source: string;
let root: string;
const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    windowsHide: true,
    encoding: 'utf8',
  }).trim();
beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-worktree-test-'));
  source = path.join(scratch, 'source');
  root = path.join(scratch, 'state');
  fs.mkdirSync(source);
  fs.mkdirSync(root);
  git(source, ['init', '--quiet']);
  git(source, ['config', 'user.name', 'Fixture']);
  git(source, ['config', 'user.email', 'fixture@invalid']);
  git(source, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(source, 'seed.txt'), 'base\n');
  fs.writeFileSync(path.join(source, '.gitignore'), 'ignored/\n');
  git(source, ['add', '.']);
  git(source, ['commit', '--quiet', '-m', 'fixture']);
});
afterEach(() => {
  // Every fixture repository lives beneath this exact generated directory.
  expect(path.dirname(scratch)).toBe(os.tmpdir());
  expect(path.basename(scratch)).toMatch(/^ultra-worktree-test-/);
  fs.rmSync(scratch, { recursive: true, force: true });
});

it('snapshots staged, unstaged and untracked files without changing source HEAD/index, then exports only new work and applies after review', async () => {
  fs.writeFileSync(path.join(source, 'seed.txt'), 'staged\n');
  git(source, ['add', 'seed.txt']);
  fs.writeFileSync(path.join(source, 'seed.txt'), 'unstaged\n');
  fs.writeFileSync(path.join(source, 'local.txt'), 'user untracked\n');
  fs.mkdirSync(path.join(source, 'ignored'));
  fs.writeFileSync(path.join(source, 'ignored', 'cache'), 'not copied');
  const head = git(source, ['rev-parse', 'HEAD']);
  const index = fs.readFileSync(path.join(source, '.git/index'));
  const id = randomUUID();
  const sourceForTask =
    process.platform === 'win32'
      ? spawnSync(
          'cmd.exe',
          ['/d', '/c', `for %I in ("${source}") do @echo %~sI`],
          {
            encoding: 'utf8',
            windowsHide: true,
            windowsVerbatimArguments: true,
          },
        )
          .stdout.trim()
          .replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
      : source;
  const state = prepareAgentWorktree(root, id, sourceForTask);
  expect(fs.readFileSync(path.join(state.directory, 'seed.txt'), 'utf8')).toBe(
    'unstaged\n',
  );
  expect(fs.readFileSync(path.join(state.directory, 'local.txt'), 'utf8')).toBe(
    'user untracked\n',
  );
  expect(fs.existsSync(path.join(state.directory, 'ignored'))).toBe(false);
  await inAgentWorktree(root, id, async (directory) => {
    fs.writeFileSync(path.join(directory!, 'seed.txt'), 'delivered\n');
    fs.writeFileSync(path.join(directory!, 'new.txt'), 'new result\n');
  });
  expect(fs.readFileSync(path.join(source, 'seed.txt'), 'utf8')).toBe(
    'unstaged\n',
  );
  expect(git(source, ['rev-parse', 'HEAD'])).toBe(head);
  expect(fs.readFileSync(path.join(source, '.git/index'))).toEqual(index);
  const exported = exportAgentWorktree(root, id);
  const patch = fs.readFileSync(exported.patch!, 'utf8');
  expect(patch).toContain('new.txt');
  expect(patch).not.toContain('diff --git a/local.txt');
  expect(() => applyAgentWorktree(root, id)).toThrow('final review');
  acceptAgentWorktree(root, id);
  applyAgentWorktree(root, id);
  expect(fs.readFileSync(path.join(source, 'seed.txt'), 'utf8')).toBe(
    'delivered\n',
  );
  expect(fs.readFileSync(path.join(source, 'local.txt'), 'utf8')).toBe(
    'user untracked\n',
  );
  expect(fs.readFileSync(path.join(source, '.git/index'))).toEqual(index);
  fs.mkdirSync(path.join(state.directory, 'ignored'));
  const ignored = path.join(state.directory, 'ignored', 'user-cache');
  fs.writeFileSync(ignored, 'preserve ignored content');
  expect(() => removeAgentWorktree(root, id)).toThrow('Git-ignored files');
  expect(fs.readFileSync(ignored, 'utf8')).toBe('preserve ignored content');
  expect(git(state.directory, ['rev-parse', 'HEAD'])).toBe(state.baseline);
  fs.unlinkSync(ignored);
  fs.rmdirSync(path.dirname(ignored));
  expect(removeAgentWorktree(root, id).phase).toBe('removed');
  expect(fs.existsSync(exported.patch!)).toBe(true);
  await expect(inAgentWorktree(root, id, async () => true)).rejects.toThrow(
    'removed',
  );
});

it('rejects a conflicting source edit or a worktree changed after review without partially applying files', () => {
  const id = randomUUID();
  const state = prepareAgentWorktree(root, id, source);
  fs.writeFileSync(path.join(state.directory, 'seed.txt'), 'agent edit\n');
  fs.writeFileSync(path.join(state.directory, 'new.txt'), 'new\n');
  acceptAgentWorktree(root, id);
  fs.writeFileSync(path.join(source, 'seed.txt'), 'concurrent user edit\n');
  expect(() => applyAgentWorktree(root, id)).toThrow();
  expect(fs.existsSync(path.join(source, 'new.txt'))).toBe(false);
  expect(fs.readFileSync(path.join(source, 'seed.txt'), 'utf8')).toBe(
    'concurrent user edit\n',
  );
  fs.writeFileSync(
    path.join(state.directory, 'new.txt'),
    'changed after review\n',
  );
  expect(() => applyAgentWorktree(root, id)).toThrow('changed after review');
  expect(() => removeAgentWorktree(root, id)).toThrow('has changes');
});

it('scopes real Config file roots and shell cwd while preserving session storage and rejects source writes through path validation', async () => {
  const id = randomUUID();
  const state = prepareAgentWorktree(root, id, source);
  const config = makeFakeConfig({ targetDir: source, cwd: source });
  const storage = config.storage.getProjectTempDir();
  await inAgentWorktree(root, id, async () => {
    expect(config.getTargetDir()).toBe(state.directory);
    expect(config.getProjectRoot()).toBe(state.directory);
    expect(config.getWorkingDir()).toBe(state.directory);
    expect(config.storage.getProjectTempDir()).toBe(storage);
    expect(config.validatePathAccess(path.join(source, 'seed.txt'))).toContain(
      'Path not in workspace',
    );
    expect(
      config.validatePathAccess(path.join(state.directory, 'seed.txt')),
    ).toBeNull();
    expect(
      execFileSync(process.execPath, ['-p', 'process.cwd()'], {
        cwd: config.getTargetDir(),
        encoding: 'utf8',
      }).trim(),
    ).toBe(state.directory);
  });
  expect(config.getTargetDir()).toBe(source);
});

it('runs native workflow stages in the managed directory and seals the final review without modifying source files', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Deliver an isolated change',
    'default',
  );
  const state = prepareAgentWorktree(root, record.id, source);
  const config = makeFakeConfig({ targetDir: source, cwd: source });
  const finished = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (agent, prompt) => {
      expect(config.getTargetDir()).toBe(state.directory);
      expect(prompt).toContain('ISOLATED TASK WORKTREE');
      if (agent === 'coder')
        fs.writeFileSync(
          path.join(config.getTargetDir(), 'new.txt'),
          'isolated result\n',
        );
      return {
        completed: true,
        text:
          agent === 'workflow-auditor'
            ? JSON.stringify({
                passed: true,
                summary: 'Inspected isolated result.',
                evidence: ['new.txt'],
              })
            : 'Scoped evidence.',
      };
    },
  );
  expect(finished.phase).toBe('completed');
  expect(fs.existsSync(path.join(source, 'new.txt'))).toBe(false);
  applyAgentWorktree(root, record.id);
  expect(fs.readFileSync(path.join(source, 'new.txt'), 'utf8')).toBe(
    'isolated result\n',
  );
});

it('keeps simultaneous scoped working directories independent', async () => {
  const config = makeFakeConfig({ targetDir: source, cwd: source });
  const a = path.join(scratch, 'a');
  const b = path.join(scratch, 'b');
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  const values = await Promise.all(
    [a, b].map((directory) =>
      withAgentWorkingDirectory(directory, async () => {
        await Promise.resolve();
        return config.getTargetDir();
      }),
    ),
  );
  expect(values).toEqual([a, b]);
  expect(config.getTargetDir()).toBe(source);
});

it('refuses missing required manifests and files changed during independent review', async () => {
  const id = randomUUID();
  await expect(
    inAgentWorktree(root, id, async () => 'must not run', true),
  ).rejects.toThrow('requires its saved worktree manifest');
  const state = prepareAgentWorktree(root, id, source);
  const reviewed = agentWorktreeTree(root, id);
  fs.writeFileSync(
    path.join(state.directory, 'seed.txt'),
    'changed while reviewer ran\n',
  );
  expect(() => acceptReviewedAgentWorktree(root, id, reviewed)).toThrow(
    'changed during or after',
  );
  expect(() => applyAgentWorktree(root, id)).toThrow('final review');
});
