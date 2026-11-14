/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager } from './i18nManager.js';
import { debugLogger } from '../utils/debugLogger.js';
let root: string;
let manager: I18nManager;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'ultra-locale-observer-'),
  );
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  manager = new I18nManager();
  vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect(path.dirname(fs.realpathSync(root))).toBe(
    fs.realpathSync(os.tmpdir()),
  );
  expect(path.basename(root)).toMatch(/^ultra-locale-observer-/);
  fs.rmSync(root, { recursive: true, force: true });
});
it('keeps a saved language switch successful and notifies healthy views after one listener throws', () => {
  const bad = vi.fn(() => {
    throw Error('PRIVATE_LOCALE_OBSERVER');
  });
  const healthy = vi.fn();
  manager.subscribe(bad);
  manager.subscribe(healthy);
  expect(() => manager.setLocale('en')).not.toThrow();
  expect(manager.getSnapshot()).toBe('en');
  expect(
    JSON.parse(fs.readFileSync(path.join(root, 'locale.json'), 'utf8')),
  ).toEqual({ locale: 'en' });
  expect(healthy).toHaveBeenCalledOnce();
  manager.setLocale('zh');
  expect(bad).toHaveBeenCalledOnce();
  expect(healthy).toHaveBeenCalledTimes(2);
});
it('notifies listeners registered during dispatch only on the next language change', () => {
  const added = vi.fn();
  manager.subscribe(() => {
    manager.subscribe(added);
  });
  manager.setLocale('en');
  expect(added).not.toHaveBeenCalled();
  manager.setLocale('zh');
  expect(added).toHaveBeenCalledOnce();
});
it('keeps normal saved language, translation and notification behavior', () => {
  const listener = vi.fn();
  const unsubscribe = manager.subscribe(listener);
  manager.setLocale('en');
  expect(manager.t('中文', 'English')).toBe('English');
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  manager.setLocale('zh');
  expect(listener).toHaveBeenCalledOnce();
  expect(new I18nManager().getLocale()).toBe('zh');
});
it('handles a rejected async listener without changing persistence or exposing its error', async () => {
  const bad = vi.fn(async () => {
    throw Error('PRIVATE_ASYNC_LOCALE');
  });
  const healthy = vi.fn();
  manager.subscribe(bad);
  manager.subscribe(healthy);
  manager.setLocale('en');
  await Promise.resolve();
  manager.setLocale('zh');
  await Promise.resolve();
  expect(bad).toHaveBeenCalledOnce();
  expect(healthy).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(vi.mocked(debugLogger.warn).mock.calls)).not.toContain(
    'PRIVATE_',
  );
  expect(new I18nManager().getLocale()).toBe('zh');
});
it('preserves duplicate subscription and unsubscribe behavior', () => {
  const listener = vi.fn();
  const unsubscribe = manager.subscribe(listener);
  manager.subscribe(listener);
  manager.setLocale('en');
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  manager.setLocale('zh');
  expect(listener).toHaveBeenCalledOnce();
});
it('keeps previous memory and disk language and skips notifications after a write failure', () => {
  manager.setLocale('zh');
  const before = fs.readFileSync(path.join(root, 'locale.json'));
  const listener = vi.fn();
  manager.subscribe(listener);
  const blocked = path.join(root, 'blocked');
  fs.writeFileSync(blocked, 'preserve');
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(blocked, 'locale.json'));
  expect(() => manager.setLocale('en')).toThrow();
  expect(manager.getLocale()).toBe('zh');
  expect(fs.readFileSync(path.join(root, 'locale.json'))).toEqual(before);
  expect(listener).not.toHaveBeenCalled();
  expect(fs.readFileSync(blocked, 'utf8')).toBe('preserve');
  expect(fs.readdirSync(root).sort()).toEqual(['blocked', 'locale.json']);
});
