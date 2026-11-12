/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';
import { getFolderStructure } from './getFolderStructure.js';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});
beforeEach(() => {
  vi.mocked(fs.readdir).mockReset();
});
it('does no filesystem work for an already cancelled directory request', async () => {
  const reason = new Error('cancel before directory');
  await expect(
    getFolderStructure('fixture', { signal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(fs.readdir).not.toHaveBeenCalled();
});
it('stops waiting for a pending native read and preserves the original cancel reason', async () => {
  let complete!: () => void;
  vi.mocked(fs.readdir).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = () => resolve([]);
      }),
  );
  const controller = new AbortController();
  const reason = new Error('cancel directory scan');
  const pending = getFolderStructure('fixture', { signal: controller.signal });
  const observed = pending.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  controller.abort(reason);
  await expect(observed).resolves.toEqual({ error: reason });
  complete();
  expect(fs.readdir).toHaveBeenCalledOnce();
});
it('rejects root failures for activation and retains the ordinary display-only fallback', async () => {
  const error = Object.assign(new Error('denied'), { code: 'EACCES' });
  vi.mocked(fs.readdir).mockRejectedValue(error);
  await expect(
    getFolderStructure('fixture', { throwOnError: true }),
  ).rejects.toBe(error);
  await expect(getFolderStructure('fixture')).resolves.toContain('fixture');
});
