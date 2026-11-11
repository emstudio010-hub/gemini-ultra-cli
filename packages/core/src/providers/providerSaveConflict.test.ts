/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lockSync } from 'proper-lockfile';
import { ProviderManager } from './providerManager.js';
let root: string;
let file: string;
const profile = {
  name: 'Seed',
  baseUrl: 'https://fixture.invalid/v1',
  apiKey: 'FAKE_KEY',
  models: ['fixture'],
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-conflict-'));
  file = path.join(root, 'providers.json');
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it('allows an explicit reload and retry while retaining the other CLI changes', () => {
  const first = new ProviderManager(file);
  first.upsertProvider(profile);
  const stale = new ProviderManager(file);
  first.upsertProvider({ ...profile, name: 'Other' });
  expect(() => stale.setReasoningEffort('ultra')).toThrow();
  stale.reloadFromDisk();
  stale.setReasoningEffort('ultra');
  const final = new ProviderManager(file);
  expect(final.getReasoningEffort()).toBe('ultra');
  expect(final.listProviders().map((provider) => provider.name)).toEqual([
    'Seed',
    'Other',
  ]);
  expect(stale.getReasoningEffort()).toBe('ultra');
  expect(fs.existsSync(file + '.lock')).toBe(false);
});
it('releases the lock after a backup failure so a corrected save can proceed', () => {
  const manager = new ProviderManager(file);
  manager.upsertProvider(profile);
  fs.mkdirSync(file + '.bak');
  expect(() => manager.setReasoningEffort('low')).toThrow();
  expect(fs.existsSync(file + '.lock')).toBe(false);
  fs.rmdirSync(file + '.bak');
  manager.setReasoningEffort('low');
  expect(new ProviderManager(file).getReasoningEffort()).toBe('low');
});
it('refuses a stale provider save without replacing the newer file, backup or in-memory selection', () => {
  const first = new ProviderManager(file);
  first.upsertProvider(profile);
  const stale = new ProviderManager(file);
  first.upsertProvider({ ...profile, name: 'Other' });
  const current = fs.readFileSync(file);
  const backup = fs.readFileSync(file + '.bak');
  expect(() => stale.setReasoningEffort('ultra')).toThrow();
  expect(fs.readFileSync(file)).toEqual(current);
  expect(fs.readFileSync(file + '.bak')).toEqual(backup);
  expect(stale.getReasoningEffort()).toBe('high');
  expect(stale.listProviders()).toHaveLength(1);
  expect(
    fs
      .readdirSync(root)
      .filter((name) => name.endsWith('.tmp') || name.endsWith('.lock')),
  ).toEqual([]);
});
it('detects configuration created after an empty manager was initialized', () => {
  const stale = new ProviderManager(file);
  new ProviderManager(file).upsertProvider(profile);
  const current = fs.readFileSync(file);
  expect(() =>
    stale.upsertProvider({ ...profile, name: 'LostUpdate' }),
  ).toThrow();
  expect(fs.readFileSync(file)).toEqual(current);
  expect(fs.existsSync(file + '.bak')).toBe(false);
});
it('does not write while another process holds the provider save lock', () => {
  const manager = new ProviderManager(file);
  manager.upsertProvider(profile);
  const before = fs.readFileSync(file);
  const release = lockSync(file, { realpath: false, retries: 0, stale: 30000 });
  try {
    expect(() => manager.setReasoningEffort('low')).toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
    expect(manager.getReasoningEffort()).toBe('high');
  } finally {
    release();
  }
});
