/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  configuredDrillToolPath,
  saveDrillToolPath,
  savedDrillToolPaths,
} from './drillToolPaths.js';
import { checkBinary, runDrillPreflight } from './drillTools.js';
import { discoverGhidraJava } from './ghidraRuntime.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-tool-paths-'));
  file = path.join(root, 'profile with spaces', 'tools.json');
  vi.stubEnv('GEMINI_ULTRA_TOOLS_FILE', file);
  for (const name of ['R2', 'RABIN2', 'JAVA'])
    vi.stubEnv('GEMINI_ULTRA_TOOL_' + name, '');
  vi.stubEnv('JAVA_HOME', '');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

it('retains the original settings and backup when atomic replacement fails', () => {
  saveDrillToolPath('r2', process.execPath);
  const before = fs.readFileSync(file);
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw Object.assign(new Error('Blocked rename'), { code: 'EPERM' });
  });
  try {
    expect(() => saveDrillToolPath('rabin2', process.execPath)).toThrow(
      'Blocked rename',
    );
    expect(fs.readFileSync(file)).toEqual(before);
    const files = fs.readdirSync(path.dirname(file));
    expect(
      files.some((name) => name.endsWith('.tmp') || name.endsWith('.lock')),
    ).toBe(false);
    const backup = files.find((name) => name.endsWith('.bak'));
    expect(fs.readFileSync(path.join(path.dirname(file), backup!))).toEqual(
      before,
    );
  } finally {
    rename.mockRestore();
  }
});

it('saves absolute paths with spaces, discovers them immediately, and backs up the prior bytes on reset', () => {
  const executable = path.join(
    root,
    process.platform === 'win32' ? 'native tool.exe' : 'native tool',
  );
  fs.copyFileSync(process.execPath, executable);
  fs.chmodSync(executable, 0o755);
  expect(savedDrillToolPaths().paths).toEqual({});
  expect(fs.existsSync(file)).toBe(false);
  saveDrillToolPath('r2', executable);
  expect(checkBinary('r2')).toEqual({
    available: true,
    pathOrStatus: executable,
  });
  const before = fs.readFileSync(file);
  const reset = saveDrillToolPath('r2');
  expect(fs.readFileSync(reset.backup!)).toEqual(before);
  expect(savedDrillToolPaths().paths).toEqual({});
  expect(configuredDrillToolPath('r2')).toEqual({});
});

it('does not overwrite saved paths when a candidate is missing, relative, or an invalid native batch wrapper', () => {
  saveDrillToolPath('r2', process.execPath);
  const before = fs.readFileSync(file);
  const wrapper = path.join(root, 'native.cmd');
  fs.writeFileSync(wrapper, 'never executed');
  for (const selected of [
    path.join(root, 'missing'),
    'relative-tool',
    wrapper,
  ]) {
    expect(() => saveDrillToolPath('r2', selected)).toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
  }
  expect(fs.readdirSync(path.dirname(file))).toEqual(['tools.json']);
});

it('preserves damaged config for reads, saves and resets while an explicit environment override still wins', () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{PRIVATE_BROKEN_CONFIGURATION');
  const before = fs.readFileSync(file);
  expect(() => savedDrillToolPaths()).toThrow('damaged');
  expect(() => saveDrillToolPath('r2', process.execPath)).toThrow('damaged');
  expect(() => saveDrillToolPath('r2')).toThrow('damaged');
  expect(checkBinary('r2')).toMatchObject({
    available: false,
    pathOrStatus: expect.stringContaining(file),
  });
  expect(configuredDrillToolPath('r2').error).not.toContain('PRIVATE');
  vi.stubEnv('GEMINI_ULTRA_TOOL_R2', process.execPath);
  expect(checkBinary('r2')).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
  expect(fs.readFileSync(file)).toEqual(before);
});

it('keeps an invalid higher-priority environment path visible instead of falling back to a saved executable', () => {
  saveDrillToolPath('r2', process.execPath);
  vi.stubEnv('GEMINI_ULTRA_TOOL_R2', path.join(root, 'missing env tool'));
  expect(checkBinary('r2')).toMatchObject({
    available: false,
    pathOrStatus: expect.stringContaining('GEMINI_ULTRA_TOOL_R2'),
  });
  expect(savedDrillToolPaths().paths.r2).toBe(process.execPath);
});

it('shares saved Java selection with preflight while preserving explicit override and JAVA_HOME precedence', async () => {
  saveDrillToolPath('java', process.execPath);
  const fallback = vi.fn(() => ({ available: false }));
  expect(await discoverGhidraJava(fallback)).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
  expect(fallback).not.toHaveBeenCalled();
  vi.stubEnv('JAVA_HOME', path.join(root, 'missing JDK'));
  expect(await discoverGhidraJava(fallback)).toMatchObject({
    available: false,
    pathOrStatus: expect.stringContaining('JAVA_HOME'),
  });
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', process.execPath);
  expect(await discoverGhidraJava(fallback)).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
  vi.stubEnv('GEMINI_ULTRA_TOOL_JAVA', '');
  vi.stubEnv('JAVA_HOME', '');
  saveDrillToolPath('r2', process.execPath);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('', { status: 200 })),
  );
  const preflight = await runDrillPreflight();
  expect(preflight.tools['java']).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
  expect(preflight.tools['r2']).toEqual({
    available: true,
    pathOrStatus: process.execPath,
  });
});
