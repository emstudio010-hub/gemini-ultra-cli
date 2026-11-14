/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager } from '../i18n/i18nManager.js';
import { loadAgentsFromDirectory } from './agentLoader.js';
const { readdir, readFile } = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readdir,
  readFile,
}));
const entry = (name: string) => ({ name, isFile: () => true });
const content = (name: string) =>
  `---\nname: ${name}\ndescription: Local fixture\n---\nRead only fixture.`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(['en', 'zh'] as const)(
  'returns a bounded diagnostic when a directory read hangs in %s',
  async (locale) => {
    vi.spyOn(I18nManager.getInstance(), 't').mockImplementation((zh, en) =>
      locale === 'zh' ? zh : en,
    );
    readdir.mockReturnValue(new Promise(() => {}));
    let settled = false;
    const loading = loadAgentsFromDirectory('fixture').then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(settled).toBe(true);
    const result = await loading;
    expect(result.agents).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('/agents reload');
    expect(result.errors[0].message).toContain(
      locale === 'zh' ? '超过 10 秒' : 'exceeded 10 seconds',
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('aborts native reads at the deadline and rejects late directory results without starting files', async () => {
  let release!: (value: unknown) => void;
  readdir.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const loading = loadAgentsFromDirectory('fixture');
  await vi.advanceTimersByTimeAsync(10_001);
  const result = await loading;
  release([entry('late.md')]);
  await vi.advanceTimersByTimeAsync(0);
  expect(readFile).not.toHaveBeenCalled();
  expect(result.agents).toEqual([]);
});

it('keeps timeout results unchanged when a non-cancellable file returns later', async () => {
  readdir.mockResolvedValue([entry('one.md'), entry('two.md')]);
  let release!: (value: string) => void;
  readFile.mockImplementation((file) =>
    String(file).endsWith('one.md')
      ? Promise.resolve(content('one'))
      : new Promise((resolve) => {
          release = resolve;
        }),
  );
  const loading = loadAgentsFromDirectory('fixture');
  await vi.advanceTimersByTimeAsync(10_001);
  const result = await loading;
  const options = readFile.mock.calls[1][1];
  expect(options.signal.aborted).toBe(true);
  expect(result.agents).toEqual([]);
  release(content('two'));
  await vi.advanceTimersByTimeAsync(0);
  expect(result.agents).toEqual([]);
  expect(result.errors).toHaveLength(1);
});

it.each(['directory', 'file'] as const)(
  'propagates caller cancellation during %s loading',
  async (phase) => {
    const controller = new AbortController();
    const reason = new Error('Explicit cancellation');
    readdir.mockImplementation(() =>
      phase === 'directory'
        ? new Promise(() => {})
        : Promise.resolve([entry('one.md')]),
    );
    readFile.mockReturnValue(new Promise(() => {}));
    const loading = loadAgentsFromDirectory('fixture', controller.signal);
    const rejected = loading.catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    expect(await rejected).toBe(reason);
    if (phase === 'file')
      expect(readFile.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('reads at most eight files concurrently while keeping directory order and individual errors', async () => {
  readdir.mockResolvedValue(
    Array.from({ length: 12 }, (_, index) => entry(`${index}.md`)),
  );
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  readFile.mockImplementation(
    (file) =>
      new Promise((resolve) => {
        active++;
        peak = Math.max(peak, active);
        const index = Number(String(file).split(/[\\/]/).at(-1)!.split('.')[0]);
        releases.push(() => {
          active--;
          resolve(index === 3 ? 'invalid' : content('agent-' + index));
        });
      }),
  );
  const loading = loadAgentsFromDirectory('fixture');
  await vi.advanceTimersByTimeAsync(0);
  expect(readFile).toHaveBeenCalledTimes(8);
  while (releases.length) {
    releases.pop()!();
    await vi.advanceTimersByTimeAsync(0);
  }
  const result = await loading;
  expect(peak).toBe(8);
  expect(result.agents.map((agent) => agent.name)).toEqual(
    Array.from({ length: 12 }, (_, index) => index)
      .filter((index) => index !== 3)
      .map((index) => 'agent-' + index),
  );
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].filePath).toMatch(/3\.md$/);
  expect(vi.getTimerCount()).toBe(0);
});
