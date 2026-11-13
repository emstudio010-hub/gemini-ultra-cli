/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { glob } from 'glob';
import { coreEvents, type Config } from '@google/gemini-cli-core';
import { FileCommandLoader } from './FileCommandLoader.js';

vi.mock('glob', () => ({ glob: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
});
const config = () =>
  ({
    getProjectRoot: () => process.cwd(),
    getFolderTrust: () => false,
    isTrustedFolder: () => true,
    getExtensions: () => [],
    storage: { isWorkspaceHomeDir: () => true },
  }) as unknown as Config;

it('bounds concurrent file reads while preserving original discovery order', async () => {
  const files = Array.from(
    { length: 24 },
    (_, index) => `command-${index}.toml`,
  );
  vi.mocked(glob).mockResolvedValue(files);
  let active = 0;
  let peak = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = vi.spyOn(fs, 'readFile').mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await gate;
    active--;
    return 'prompt = "Saved custom command"';
  });
  const loading = new FileCommandLoader(config()).loadCommands(
    new AbortController().signal,
  );
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  const observedPeak = peak;
  release();
  const commands = await loading;
  expect(observedPeak).toBeLessThanOrEqual(8);
  expect(peak).toBeLessThanOrEqual(8);
  expect(commands.map((command) => command.name)).toEqual(
    files.map((file) => path.basename(file, '.toml')),
  );
  expect(read).toHaveBeenCalledTimes(24);
});

it('passes cancellation to active reads and never starts queued reads or parses late data', async () => {
  const files = Array.from(
    { length: 24 },
    (_, index) => `command-${index}.toml`,
  );
  vi.mocked(glob).mockResolvedValue(files);
  const controller = new AbortController();
  const feedback = vi.spyOn(coreEvents, 'emitFeedback');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const signals: Array<AbortSignal | undefined> = [];
  const read = vi
    .spyOn(fs, 'readFile')
    .mockImplementation(async (_file, options) => {
      signals.push(
        typeof options === 'object' && options !== null && 'signal' in options
          ? options.signal
          : undefined,
      );
      await gate;
      return 'This late TOML is deliberately invalid';
    });
  const loading = new FileCommandLoader(config()).loadCommands(
    controller.signal,
  );
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  controller.abort(new Error('Cancelled command load'));
  release();
  expect(await loading).toEqual([]);
  expect(read.mock.calls.length).toBeLessThanOrEqual(8);
  expect(signals.every((signal) => signal === controller.signal)).toBe(true);
  expect(feedback).not.toHaveBeenCalled();
});

it('does not scan any directory for an already cancelled load', async () => {
  vi.mocked(glob).mockClear();
  vi.mocked(glob).mockResolvedValue([]);
  const controller = new AbortController();
  controller.abort();
  expect(
    await new FileCommandLoader(config()).loadCommands(controller.signal),
  ).toEqual([]);
  expect(glob).not.toHaveBeenCalled();
});
