/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lockSync } from 'proper-lockfile';
import {
  loadSkillLibraryRegistry,
  registerSkillInLibrary,
  getSkillLibraryEntry,
} from './skillOrchestrator.js';
vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});
let root: string;
let file: string;
const entry = {
  name: 'fixture',
  domain: 'specialized-domain' as const,
  badge: 'Fixture',
  tags: ['#fixture'],
  mode: 'tagged' as const,
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-skill-library-'));
  vi.mocked(os.homedir).mockReturnValue(root);
  file = path.join(root, '.gemini/config/skill-tags.json');
  vi.stubEnv('GEMINI_ULTRA_SKILL_LIBRARY_FILE', file);
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it('does not create a global config directory when only looking up missing skill metadata', () => {
  expect(getSkillLibraryEntry('fixture')).toBeUndefined();
  expect(fs.existsSync(path.dirname(file))).toBe(false);
});
it.each([
  '{broken',
  '[]',
  JSON.stringify({ fixture: { ...entry, tags: 'invalid', updatedAt: '' } }),
])(
  'preserves invalid metadata instead of replacing it with a new empty registry: %s',
  (content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    expect(() => registerSkillInLibrary(entry)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  },
);
it('does not treat inherited object properties as existing skill records', () => {
  expect(getSkillLibraryEntry('constructor')).toBeUndefined();
  expect(getSkillLibraryEntry('toString')).toBeUndefined();
});
it('merges the latest records and keeps an exact backup on replacement', () => {
  const first = registerSkillInLibrary(entry);
  const original = fs.readFileSync(file);
  registerSkillInLibrary({ ...entry, name: 'other' });
  expect(loadSkillLibraryRegistry()['fixture']).toEqual(first);
  expect(getSkillLibraryEntry('OTHER')?.name).toBe('other');
  const backups = fs
    .readdirSync(path.dirname(file))
    .filter((name) => name.endsWith('.bak'));
  expect(
    backups.some((name) =>
      fs.readFileSync(path.join(path.dirname(file), name)).equals(original),
    ),
  ).toBe(true);
  expect(
    fs
      .readdirSync(path.dirname(file))
      .some((name) => name.endsWith('.tmp') || name.endsWith('.lock')),
  ).toBe(false);
});

it('rejects a busy writer without changing the existing registry', () => {
  registerSkillInLibrary(entry);
  const before = fs.readFileSync(file);
  const release = lockSync(file, { realpath: false });
  try {
    expect(() => registerSkillInLibrary({ ...entry, name: 'other' })).toThrow();
  } finally {
    release();
  }
  expect(fs.readFileSync(file).equals(before)).toBe(true);
});

it('rejects an oversized registry before decoding or overwriting it', () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  fs.truncateSync(file, 1024 * 1024 + 1);
  expect(() => loadSkillLibraryRegistry()).toThrow();
  expect(() => registerSkillInLibrary(entry)).toThrow();
  expect(fs.statSync(file).size).toBe(1024 * 1024 + 1);
});
