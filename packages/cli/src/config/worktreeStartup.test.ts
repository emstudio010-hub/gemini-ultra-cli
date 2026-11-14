/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import {
  isGeminiWorktree,
  getProjectRootForWorktree,
} from '@google/gemini-cli-core';
import { resolveWorktreeSettings } from './config.js';
const runGit = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: readonly string[],
      options?: { cancelSignal?: AbortSignal },
    ) => Promise<{ stdout: string }>
  >(),
);
vi.mock('execa', () => ({ execa: runGit }));
vi.mock('@google/gemini-cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/gemini-cli-core')>()),
  isGeminiWorktree: vi.fn(() => true),
  getProjectRootForWorktree: vi.fn(),
}));
const root = path.resolve('/fixture/project');
const worktree = path.join(root, '.gemini', 'worktrees', 'feature');
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(getProjectRootForWorktree).mockResolvedValue(root);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it.each(['--show-toplevel', '--git-common-dir', 'HEAD'])(
  'bounds the whole startup discovery while %s is pending and cannot advance after a late result',
  async (heldStage) => {
    let release!: (result: { stdout: string }) => void;
    let entered = false;
    const held = new Promise<{ stdout: string }>((resolve) => {
      release = resolve;
    });
    if (heldStage === '--git-common-dir')
      vi.mocked(getProjectRootForWorktree).mockImplementationOnce(async () => {
        entered = true;
        await held;
        return root;
      });
    runGit.mockImplementation((_file, args) => {
      const stage = args?.[1];
      if (stage === heldStage) {
        entered = true;
        return held;
      }
      return Promise.resolve({
        stdout:
          stage === '--show-toplevel'
            ? worktree
            : stage === '--git-common-dir'
              ? path.join(root, '.git')
              : 'fixture-sha',
      });
    });
    let settled = false;
    const pending = resolveWorktreeSettings(worktree).then((value) => {
      settled = true;
      return value;
    });
    for (let tick = 0; tick < 15 && !entered; tick++) await Promise.resolve();
    expect(entered).toBe(true);
    try {
      await vi.advanceTimersByTimeAsync(2000);
      expect(settled).toBe(true);
      const calls = runGit.mock.calls;
      expect(
        heldStage === '--git-common-dir'
          ? vi.mocked(getProjectRootForWorktree).mock.calls.at(-1)?.[1]?.aborted
          : calls.at(-1)?.[2]?.cancelSignal?.aborted,
      ).toBe(true);
      expect(await pending).toBeUndefined();
      const count = calls.length;
      release({
        stdout:
          heldStage === 'HEAD'
            ? 'late-sha'
            : heldStage === '--show-toplevel'
              ? worktree
              : path.join(root, '.git'),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(runGit).toHaveBeenCalledTimes(count);
    } finally {
      release({ stdout: path.join(root, '.git') });
      await pending;
    }
  },
);
it('returns the existing managed worktree and cancels no normal process', async () => {
  runGit
    .mockResolvedValueOnce({ stdout: worktree })
    .mockResolvedValueOnce({ stdout: 'fixture-sha\n' });
  await expect(resolveWorktreeSettings(worktree)).resolves.toEqual({
    name: 'feature',
    path: worktree,
    baseSha: 'fixture-sha',
  });
  expect(runGit).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not read HEAD outside a managed worktree', async () => {
  vi.mocked(isGeminiWorktree).mockReturnValueOnce(false);
  runGit.mockResolvedValueOnce({ stdout: root });
  await expect(resolveWorktreeSettings(root)).resolves.toBeUndefined();
  expect(runGit).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
