/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { glob } from 'glob';
import { loadSkillFromFile, loadSkillsFromDir } from './skillLoader.js';
import { readFileWithEncoding } from '../utils/fileUtils.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('node:fs/promises', () => ({ stat: vi.fn(), readdir: vi.fn() }));
vi.mock('glob', () => ({ glob: vi.fn() }));
vi.mock('../utils/fileUtils.js', () => ({ readFileWithEncoding: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it('does not scan or report warnings when cancelled before discovery', async () => {
  const controller = new AbortController();
  const reason = new Error('Stopped before scanning');
  controller.abort(reason);
  const feedback = vi.spyOn(coreEvents, 'emitFeedback');
  await expect(loadSkillsFromDir('/skills', controller.signal)).rejects.toBe(
    reason,
  );
  expect(fs.stat).not.toHaveBeenCalled();
  expect(glob).not.toHaveBeenCalled();
  expect(readFileWithEncoding).not.toHaveBeenCalled();
  expect(feedback).not.toHaveBeenCalled();
});

it('stops waiting for directory metadata without swallowing cancellation as missing files', async () => {
  vi.mocked(fs.stat).mockReturnValue(new Promise(() => {}));
  const feedback = vi.spyOn(coreEvents, 'emitFeedback');
  const controller = new AbortController();
  const reason = new Error('Stopped during directory stat');
  const pending = loadSkillsFromDir('/skills', controller.signal);
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(glob).not.toHaveBeenCalled();
  expect(feedback).not.toHaveBeenCalled();
});

it('cancels active reads, leaves queued files unread, and ignores late content', async () => {
  vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Awaited<
    ReturnType<typeof fs.stat>
  >);
  const files = Array.from({ length: 24 }, (_, i) => `/skills/${i}/SKILL.md`);
  vi.mocked(glob).mockResolvedValue(files);
  const releases: Array<(content: string) => void> = [];
  vi.mocked(readFileWithEncoding).mockImplementation(
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const feedback = vi.spyOn(coreEvents, 'emitFeedback');
  const log = vi.spyOn(debugLogger, 'log');
  const controller = new AbortController();
  const pending = loadSkillsFromDir('/skills', controller.signal);
  await vi.waitFor(() => expect(releases).toHaveLength(8));
  expect(readFileWithEncoding).toHaveBeenCalledWith(
    files[0],
    undefined,
    controller.signal,
  );
  const reason = new Error('Stopped while reading');
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  // A non-cooperative reader may finish later; cancelled work must not parse it.
  for (const release of releases)
    release('---\nname: late\ndescription: Late skill\n---\nLate body');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(readFileWithEncoding).toHaveBeenCalledTimes(8);
  expect(fs.readdir).not.toHaveBeenCalled();
  expect(feedback).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it('observes a late reader rejection after cancelling a single skill read', async () => {
  let fail!: (reason: Error) => void;
  vi.mocked(readFileWithEncoding).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const log = vi.spyOn(debugLogger, 'log');
  const controller = new AbortController();
  const pending = loadSkillFromFile('/skills/one/SKILL.md', controller.signal);
  const reason = new Error('Stopped single read');
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  fail(new Error('Late read failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(log).not.toHaveBeenCalled();
});
