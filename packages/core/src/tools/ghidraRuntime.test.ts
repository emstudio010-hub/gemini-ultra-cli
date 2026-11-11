/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDrillPreflight } from './drillTools.js';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  const find = () => Promise.resolve({ stdout: process.execPath, stderr: '' });
  return {
    ...original,
    execFile: Object.assign(vi.fn(), {
      [Symbol.for('nodejs.util.promisify.custom')]: find,
    }),
  };
});
vi.mock('../drill/drillGrant.js', () => ({
  readDrillGrant: () => ({ granted: false, allowedNetScope: [] }),
}));

let root: string;
let javaHome: string;
let java: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultra-java-discovery-'));
  javaHome = path.join(root, 'jdk with spaces');
  java = path.join(
    javaHome,
    'bin',
    process.platform === 'win32' ? 'java.exe' : 'java',
  );
  await fs.mkdir(path.dirname(java), { recursive: true });
  await fs.writeFile(java, 'discovery fixture, never executed', {
    mode: 0o755,
  });
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', '');
  vi.stubEnv('JAVA_HOME', '');
  vi.stubEnv('GEMINI_ULTRA_GHIDRA_HOME', '');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('', { status: 200 })),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(path.dirname(root)).toBe(os.tmpdir());
  await fs.rm(root, { recursive: true, force: true });
});

it('does not claim PATH Java is ready when the selected JAVA_HOME is invalid', async () => {
  vi.stubEnv('JAVA_HOME', path.join(root, 'missing jdk'));
  const result = await runDrillPreflight();
  expect(result.tools['java'].available).toBe(false);
  expect(result.tools['java'].pathOrStatus).toContain('JAVA_HOME');
  expect(result.tools['java'].pathOrStatus).toContain('missing jdk');
});

it('does not hide an invalid explicit Java override with a valid JAVA_HOME', async () => {
  vi.stubEnv('JAVA_HOME', javaHome);
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', path.join(root, 'missing java'));
  const result = await runDrillPreflight();
  expect(result.tools['java'].available).toBe(false);
  expect(result.tools['java'].pathOrStatus).toContain('GEMINI_ULTRA_TOOL_JAVA');
  expect(result.tools['java'].pathOrStatus).toContain('missing java');
});

it('shows the same higher-priority JAVA_HOME path used by decompilation', async () => {
  vi.stubEnv('JAVA_HOME', javaHome);
  const result = await runDrillPreflight();
  expect(result.tools['java']).toEqual({ available: true, pathOrStatus: java });
});

it('rejects batch wrappers instead of reporting a usable native Java runtime', async () => {
  const wrapper = path.join(root, 'java.cmd');
  await fs.writeFile(wrapper, 'do not execute', { mode: 0o755 });
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', wrapper);
  const result = await runDrillPreflight();
  expect(result.tools['java'].available).toBe(false);
  expect(result.tools['java'].pathOrStatus).toContain('native Java');
});

it('uses PATH only when no explicit Java selection exists', async () => {
  const result = await runDrillPreflight();
  expect(result.tools['java']).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
});
