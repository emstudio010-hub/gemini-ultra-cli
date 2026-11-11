/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ExecFileOptions } from 'node:child_process';
import { inspectBinary } from './binaryInspect.js';

const { execute, discover } = vi.hoisted(() => ({
  execute: vi.fn(),
  discover: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFile: execute }));
vi.mock('./drillTools.js', () => ({ checkBinary: discover }));

describe('Bounded native binary inspection', () => {
  let directory: string;
  let sample: string;
  beforeEach(async () => {
    vi.resetAllMocks();
    directory = await mkdtemp(path.join(os.tmpdir(), 'ultra-native-inspect-'));
    sample = path.join(directory, 'sample & literal.bin');
    await writeFile(sample, 'generated sample');
    discover.mockReturnValue({
      available: true,
      pathOrStatus: process.execPath,
    });
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const respond = (output: string, error: Error | null = null) => {
    execute.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: ExecFileOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(error, output, ''),
    );
  };

  it('preserves 64-bit native metadata integers and numeric-looking string names exactly', async () => {
    respond(
      '{"info":{"baddr":18446603336221196417,"bits":64,"name":"18446603336221196417","nested":{"vaddr":18446744073709551615}}}',
    );
    const result = await inspectBinary(
      { filePath: sample },
      directory,
      new AbortController().signal,
    );
    expect(result.data).toEqual({
      baddr: '18446603336221196417',
      bits: 64,
      name: '18446603336221196417',
      nested: { vaddr: '18446744073709551615' },
    });
  });

  it('uses fixed read-only arguments, an absolute literal path and bounded array output', async () => {
    respond(
      JSON.stringify({
        imports: [{ name: 'ExitProcess' }, { name: 'ReadFile' }],
      }),
    );
    const signal = new AbortController().signal;
    const result = await inspectBinary(
      { filePath: path.basename(sample), view: 'imports', maxItems: 1 },
      directory,
      signal,
    );
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      ['-ij', sample],
      expect.objectContaining({
        shell: false,
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
        signal,
      }),
      expect.any(Function),
    );
    expect(result).toMatchObject({
      data: [{ name: 'ExitProcess' }],
      returnedItems: 1,
      totalItems: 2,
      truncated: true,
    });
  });

  it('rejects invalid parameters and missing files before invoking the native process', async () => {
    await expect(
      inspectBinary(
        { filePath: sample, maxItems: 0 },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      inspectBinary(
        { filePath: path.join(directory, 'absent.bin') },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports missing tools and honours cancellation without reporting success', async () => {
    discover.mockReturnValue({ available: false });
    await expect(
      inspectBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('GEMINI_ULTRA_TOOL_RABIN2');
    const controller = new AbortController();
    controller.abort();
    await expect(
      inspectBinary({ filePath: sample }, directory, controller.signal),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    discover.mockReturnValue({
      available: true,
      pathOrStatus: process.execPath,
    });
    const running = new AbortController();
    execute.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: ExecFileOptions,
        callback: (error: Error, stdout: string, stderr: string) => void,
      ) => {
        running.abort();
        callback(new Error('aborted'), '', '');
      },
    );
    await expect(
      inspectBinary({ filePath: sample }, directory, running.signal),
    ).rejects.toThrow('cancelled');
  });

  it('distinguishes invalid JSON, output overflow and timeout from complete results', async () => {
    respond('{broken');
    await expect(
      inspectBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('valid JSON');
    respond(
      '',
      Object.assign(new Error('overflow'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        killed: true,
      }),
    );
    await expect(
      inspectBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('4 MiB');
    respond('', Object.assign(new Error('timeout'), { killed: true }));
    await expect(
      inspectBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('20 seconds');
  });
});
