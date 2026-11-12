/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { DrillPreflightTool, runDrillPreflight } from './drillTools.js';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: lookup,
  }),
}));
vi.mock('../drill/drillGrant.js', () => ({
  readDrillGrant: () => ({ granted: false, allowedNetScope: [] }),
}));

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-preflight-cancel-'));
  vi.stubEnv('GEMINI_ULTRA_TOOLS_FILE', path.join(root, 'tools.json'));
  vi.stubEnv('GEMINI_ULTRA_GHIDRA_HOME', '');
  vi.stubEnv('JAVA_HOME', '');
  for (const name of [
    'GHIDRA',
    'ANALYZEHEADLESS',
    'JAVA',
    'RADARE2',
    'R2',
    'RABIN2',
    'JADX',
    'FRIDA',
    'NUCLEI',
    'FSCAN',
    'GOGO',
    'PYTHON3',
    'PYTHON',
    'GDB',
    'LLDB',
  ])
    vi.stubEnv('GEMINI_ULTRA_TOOL_' + name, '');
  lookup.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('does not start probes when the native preflight invocation is already cancelled', async () => {
  lookup.mockResolvedValue({ stdout: process.execPath });
  const fetch = vi.fn().mockResolvedValue(new Response('unused'));
  vi.stubGlobal('fetch', fetch);
  const reason = new Error('Cancelled before preflight');
  const invocation = new DrillPreflightTool(
    {} as Config,
    createMockMessageBus(),
  ).build({});
  await expect(
    invocation.execute({ abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(lookup).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('aborts all active PATH probes and the IDA request without returning a ready result', async () => {
  const signals: AbortSignal[] = [];
  let finished = 0;
  lookup.mockImplementation(async (_command, _args, options) => {
    const signal = options.signal as AbortSignal | undefined;
    if (!signal) return { stdout: process.execPath };
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          finished++;
          reject(signal.reason);
        },
        { once: true },
      );
    });
  });
  const fetch = vi.fn().mockImplementation(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            finished++;
            reject(options.signal.reason);
          },
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  const pending = runDrillPreflight(controller.signal);
  const reason = new Error('Cancel running preflight');
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(signals).toHaveLength(15);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(finished).toBe(16);
});

it('releases an unused IDA response body and still reports successful discovery', async () => {
  lookup.mockResolvedValue({ stdout: process.execPath });
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(new ReadableStream({ cancel }), { status: 200 }),
      ),
  );
  const result = await runDrillPreflight();
  expect(result.tools['ida-pro-mcp']).toMatchObject({
    available: true,
    pathOrStatus: 'HTTP 200',
  });
  expect(cancel).toHaveBeenCalledTimes(1);
});
