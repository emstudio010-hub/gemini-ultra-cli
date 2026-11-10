/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ExecFileOptions } from 'node:child_process';
import { decompileBinary } from './binaryDecompile.js';
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execute }));
vi.mock('./drillTools.js', () => ({
  checkBinary: () => ({ available: false }),
}));
let root: string;
let sample: string;
let scratch: string;
const report = {
  completed: true,
  analysisTimedOut: false,
  functionName: 'verify_key',
  address: '00401000',
  imageBase: '00200000',
  language: 'x86:LE:64:default',
  compiler: 'gcc',
  signature: 'uint verify_key(char *, uint)',
  selection: 'requested-address',
  code:
    'uint verify_key() {\n' +
    '  /* recovered code */\n'.repeat(100) +
    '  return 42;\n}\n',
  diagnostics: '',
};
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultra-decompile-test-'));
  const ghidra = path.join(root, 'ghidra & install');
  await fs.mkdir(path.join(ghidra, 'Ghidra/Framework/Utility/lib'), {
    recursive: true,
  });
  await fs.mkdir(path.join(ghidra, 'support'));
  await fs.writeFile(
    path.join(ghidra, 'Ghidra/Framework/Utility/lib/Utility.jar'),
    'test install',
  );
  await fs.writeFile(
    path.join(ghidra, 'Ghidra/application.properties'),
    'application.version=12.1.4\n',
  );
  await fs.writeFile(
    path.join(ghidra, 'support/launch.properties'),
    'VMARGS=-Djava.system.class.loader=ghidra.GhidraClassLoader\n',
  );
  const cpu = process.arch === 'arm64' ? 'arm_64' : 'x86_64';
  const nativePlatform = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}_${cpu}`;
  const native = path.join(
    ghidra,
    'Ghidra/Features/Decompiler/os',
    nativePlatform,
  );
  await fs.mkdir(native, { recursive: true });
  await fs.writeFile(
    path.join(
      native,
      process.platform === 'win32' ? 'decompile.exe' : 'decompile',
    ),
    'fixture native',
    { mode: 0o755 },
  );
  vi.stubEnv('GEMINI_ULTRA_GHIDRA_HOME', ghidra);
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', process.execPath);
  sample = path.join(root, 'literal & sample.bin');
  await fs.writeFile(sample, 'immutable sample');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  expect(path.dirname(root)).toBe(os.tmpdir());
  await fs.rm(root, { recursive: true, force: true });
});
function launch(result: unknown, failure: Error | null = null) {
  execute.mockImplementation(
    (
      _java: string,
      args: string[],
      options: ExecFileOptions,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      scratch = args[args.indexOf('-scriptPath') + 1];
      const output = args[args.indexOf('-postScript') + 2];
      expect(options).toMatchObject({
        shell: false,
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      });
      void (async () => {
        expect(
          await fs.readFile(path.join(scratch, 'sample.bin'), 'utf8'),
        ).toBe('immutable sample');
        if (result !== undefined)
          await fs.writeFile(output, JSON.stringify(result));
        callback(failure, 'bounded analyzer log', '');
      })();
    },
  );
}
it('passes literal JVM arguments, keeps immutable input and full hashed artifacts while truncating only preview', async () => {
  launch(report);
  const result = await decompileBinary(
    { filePath: sample, address: '0x401000', maxChars: 1000 },
    root,
    root,
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    truncated: true,
    originalChars: report.code.length,
    sourceChangedDuringAnalysis: false,
    ghidraVersion: '12.1.4',
  });
  expect(result.code).toHaveLength(1000);
  expect(await fs.readFile(result.codeArtifact, 'utf8')).toBe(report.code);
  expect(await fs.readFile(sample, 'utf8')).toBe('immutable sample');
  expect(await fs.readFile(result.logArtifact, 'utf8')).toContain(
    'bounded analyzer log',
  );
  await expect(fs.stat(scratch)).rejects.toThrow();
  const args = execute.mock.calls[0][1] as string[];
  expect(args.at(-1)).toBe('401000');
  expect(args).toContain('ghidra.app.util.headless.AnalyzeHeadless');
});
it('rejects expressions and workspace-denied samples before starting any parser', async () => {
  await expect(
    decompileBinary(
      { filePath: sample, address: '401000;!whoami' },
      root,
      root,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  await expect(
    decompileBinary(
      { filePath: sample },
      root,
      root,
      new AbortController().signal,
      () => 'Path not in workspace',
    ),
  ).rejects.toThrow('Path not in workspace');
  expect(execute).not.toHaveBeenCalled();
});
it('does not turn a zero-exit script failure or timed-out analysis into a complete result; retains diagnostics', async () => {
  for (const output of [undefined, { ...report, analysisTimedOut: true }]) {
    launch(output);
    await expect(
      decompileBinary(
        { filePath: sample },
        root,
        root,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Evidence directory');
    await expect(fs.stat(scratch)).rejects.toThrow();
  }
  const runs = await fs.readdir(path.join(root, 'decompilations'));
  for (const run of runs) {
    const files = await fs.readdir(path.join(root, 'decompilations', run));
    expect(files).toEqual(['analysis.log']);
  }
});
it('fails before launch on cancellation or missing native JDK and preserves the sample', async () => {
  const cancelled = AbortSignal.abort();
  await expect(
    decompileBinary({ filePath: sample }, root, root, cancelled),
  ).rejects.toThrow();
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', '');
  vi.stubEnv('JAVA_HOME', '');
  await expect(
    decompileBinary(
      { filePath: sample },
      root,
      root,
      new AbortController().signal,
    ),
  ).rejects.toThrow('native Java');
  expect(execute).not.toHaveBeenCalled();
  await fs.rm(
    path.join(
      process.env['GEMINI_ULTRA_GHIDRA_HOME']!,
      'Ghidra/Features/Decompiler/os',
    ),
    { recursive: true },
  );
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', process.execPath);
  await expect(
    decompileBinary(
      { filePath: sample },
      root,
      root,
      new AbortController().signal,
    ),
  ).rejects.toThrow('Missing executable Ghidra decompiler');
  expect(execute).not.toHaveBeenCalled();
  expect(await fs.readFile(sample, 'utf8')).toBe('immutable sample');
});
