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
import { analyzeBinary, BinaryAnalyzeTool } from './binaryAnalyze.js';
import { PLAN_MODE_TOOLS, ALL_BUILTIN_TOOL_NAMES } from './tool-names.js';
const { execute, discover } = vi.hoisted(() => ({
  execute: vi.fn(),
  discover: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFile: execute }));
vi.mock('./drillTools.js', () => ({ checkBinary: discover }));
describe('bounded static binary analysis', () => {
  let directory: string;
  let sample: string;
  beforeEach(async () => {
    vi.resetAllMocks();
    directory = await mkdtemp(path.join(os.tmpdir(), 'ultra-analyze-'));
    sample = path.join(directory, 'literal & file.bin');
    await writeFile(sample, 'generated sample');
    discover.mockReturnValue({
      available: true,
      pathOrStatus: process.execPath,
    });
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const respond = (output: string, error: Error | null = null) =>
    execute.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: ExecFileOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(error, output, ''),
    );

  it.each(['functions', 'instructions', 'xrefs'] as const)(
    'preserves unsigned 64-bit %s addresses from native JSON without rounding',
    async (view) => {
      respond(
        view === 'functions'
          ? '[{"addr":18446603336221196417,"name":"high"}]'
          : view === 'instructions'
            ? '[{"addr":18446603336221196417,"opcode":"ret"}]'
            : '[{"from":18446603336221196417,"type":"CALL"}]',
      );
      const result = await analyzeBinary(
        { filePath: sample, view, address: '0xffff800000000081' },
        directory,
        new AbortController().signal,
      );
      expect(result.data[0]).toHaveProperty(
        view === 'xrefs' ? 'from' : 'addr',
        '18446603336221196417',
      );
      expect(JSON.stringify(result)).not.toContain('18446603336221196000');
    },
  );
  it('preserves large passthrough targets while keeping safe addresses and counts numeric', async () => {
    respond(
      '[{"addr":16,"opcode":"call high","jump":18446603336221196417,"refs":[{"addr":18446744073709551615}],"size":5}]',
    );
    const result = await analyzeBinary(
      { filePath: sample, view: 'instructions' },
      directory,
      new AbortController().signal,
    );
    expect(result.data[0]).toMatchObject({
      addr: 16,
      jump: '18446603336221196417',
      refs: [{ addr: '18446744073709551615' }],
      size: 5,
    });
    expect(result.returnedItems).toBe(1);
  });

  it('uses closed read-only commands, literal absolute paths and bounded instruction windows', async () => {
    respond(
      JSON.stringify([
        { addr: 16, opcode: 'nop' },
        { addr: 17, opcode: 'ret' },
      ]),
    );
    const signal = new AbortController().signal;
    const result = await analyzeBinary(
      {
        filePath: path.basename(sample),
        view: 'instructions',
        address: '16',
        maxItems: 1,
      },
      directory,
      signal,
    );
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      ['-NN', '-q', '-x', '-e', 'scr.color=0', '-c', 'pdj 2 @ 0x10', sample],
      expect.objectContaining({
        shell: false,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        signal,
      }),
      expect.any(Function),
    );
    expect(result).toMatchObject({
      data: [{ addr: 16, opcode: 'nop' }],
      returnedItems: 1,
      truncated: true,
    });
    expect(result).not.toHaveProperty('totalItems');
  });

  it('rejects command expressions, unsafe integers and missing xref addresses before process creation', async () => {
    for (const address of [
      'entry0;!whoami',
      '0x10\nq',
      '-1',
      '0x10000000000000000',
      '18446744073709551616',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await expect(
        analyzeBinary(
          { filePath: sample, view: 'xrefs', address },
          directory,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    }
    await expect(
      analyzeBinary(
        { filePath: sample, view: 'xrefs' },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('requires a numeric address');
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps function and reference counts explicit, including empty static observations', async () => {
    respond('[{"addr":16,"name":"entry0"},{"offset":32,"name":"helper"}]');
    const functions = await analyzeBinary(
      { filePath: sample, maxItems: 1 },
      directory,
      new AbortController().signal,
    );
    expect(execute.mock.lastCall?.[1]).toContain('aa;aflj');
    expect(functions).toMatchObject({
      returnedItems: 1,
      totalItems: 2,
      truncated: true,
    });
    respond('[]');
    const xrefs = await analyzeBinary(
      { filePath: sample, view: 'xrefs', address: '0xffffffffffffffff' },
      directory,
      new AbortController().signal,
    );
    expect(execute.mock.lastCall?.[1]).toContain(
      'aaa;axtj @ 0xffffffffffffffff',
    );
    expect(xrefs).toMatchObject({ data: [], totalItems: 0, truncated: false });
    expect(xrefs.scope).toContain('do not prove absence');
    expect(PLAN_MODE_TOOLS).toContain(BinaryAnalyzeTool.Name);
    expect(ALL_BUILTIN_TOOL_NAMES).toContain(BinaryAnalyzeTool.Name);
  });

  it('reports missing tools and pre-cancellation without invoking a process', async () => {
    discover.mockReturnValue({ available: false });
    await expect(
      analyzeBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('GEMINI_ULTRA_TOOL_R2');
    const controller = new AbortController();
    const reason = new Error('User stopped');
    controller.abort(reason);
    await expect(
      analyzeBinary({ filePath: sample }, directory, controller.signal),
    ).rejects.toBe(reason);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects malformed or structurally invalid results and distinguishes timeout/output overflow', async () => {
    for (const output of ['{broken', '[{}]']) {
      respond(output);
      await expect(
        analyzeBinary(
          { filePath: sample },
          directory,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    }
    respond(
      '',
      Object.assign(new Error('overflow'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        killed: true,
      }),
    );
    await expect(
      analyzeBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('exceeded 4 MiB');
    respond('', Object.assign(new Error('timeout'), { killed: true }));
    await expect(
      analyzeBinary(
        { filePath: sample },
        directory,
        new AbortController().signal,
      ),
    ).rejects.toThrow('timed out after 30 seconds');
  });
});
