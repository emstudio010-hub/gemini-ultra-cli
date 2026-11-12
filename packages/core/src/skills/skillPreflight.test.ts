/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { preflightSkillTools } from './skillOrchestrator.js';
import {
  checkBinary,
  checkBinaryAsync,
  runDrillPreflight,
} from '../tools/drillTools.js';

vi.mock('../tools/drillTools.js', () => ({
  checkBinary: vi.fn().mockReturnValue({ available: false }),
  checkBinaryAsync: vi.fn(),
  checkIdaMcp: vi.fn().mockResolvedValue({ available: false }),
  runDrillPreflight: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects pre-cancelled skill inspection before any locator or IDA call', async () => {
  const controller = new AbortController();
  const reason = new Error('stop skill inspection');
  controller.abort(reason);
  await expect(
    preflightSkillTools('system-architecture', controller.signal, 'en'),
  ).rejects.toBe(reason);
  expect(checkBinary).not.toHaveBeenCalled();
  expect(checkBinaryAsync).not.toHaveBeenCalled();
  expect(runDrillPreflight).not.toHaveBeenCalled();
});

it('starts asynchronous locators with the shared signal and preserves cancellation reason', async () => {
  const controller = new AbortController();
  const reason = new Error('cancel running inspection');
  vi.mocked(checkBinaryAsync).mockImplementation(
    (_name, signal) =>
      new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), {
          once: true,
        });
      }),
  );
  const result = preflightSkillTools(
    'system-architecture',
    controller.signal,
    'en',
  );
  const settled = result.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const called = vi
    .mocked(checkBinaryAsync)
    .mock.calls.map(([name, signal]) => ({
      name,
      sameSignal: signal === controller.signal,
    }));
  controller.abort(reason);
  expect(await settled).toEqual({ error: reason });
  expect(called).toEqual([
    { name: 'git', sameSignal: true },
    { name: 'node', sameSignal: true },
  ]);
  expect(checkBinary).not.toHaveBeenCalled();
});

it('reports discovery honestly without claiming GPU readiness, in the selected language', async () => {
  vi.mocked(checkBinaryAsync).mockResolvedValue({
    available: true,
    pathOrStatus: 'fixture/tool',
  });
  const report = await preflightSkillTools('multimedia-video', undefined, 'en');
  expect(report.readyTools.map((item) => item.name)).toEqual([
    'FFmpeg',
    'FFprobe',
    'Remotion CLI',
  ]);
  expect(report.readyTools[0].detail).toContain(
    'version and capabilities not verified',
  );
  expect(JSON.stringify(report)).not.toContain('GPU');
  expect(checkBinary).not.toHaveBeenCalled();
});

it('uses the real reverse preflight readiness and r2 alias instead of a launcher-only Ghidra claim', async () => {
  const controller = new AbortController();
  vi.mocked(runDrillPreflight).mockResolvedValue({
    granted: false,
    allowedNetScope: [],
    tools: {
      'ida-pro-mcp': { available: false },
      ghidra: { available: true },
      'ghidra-decompiler': { available: false },
      r2: { available: true, pathOrStatus: 'fixture/r2' },
      jadx: { available: false },
      python: { available: true, pathOrStatus: 'fixture/python' },
    },
  });
  const report = await preflightSkillTools(
    'security-reverse',
    controller.signal,
    'zh',
  );
  expect(runDrillPreflight).toHaveBeenCalledWith(controller.signal);
  expect(report.readyTools.map((item) => item.name)).toEqual([
    'Radare2',
    'Python',
  ]);
  expect(report.missingTools.map((item) => item.name)).toContain(
    'Ghidra 反编译器',
  );
  expect(checkBinary).not.toHaveBeenCalled();
});
