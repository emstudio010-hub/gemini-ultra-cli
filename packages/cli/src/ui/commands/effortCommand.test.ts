/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager, ProviderManager } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { effortCommand } from './effortCommand.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-effort-save-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['zh', 'en'] as const)(
  'reports an effort save conflict locally in %s without changing disk or cached effort',
  async (locale) => {
    I18nManager.getInstance().setLocale(locale);
    const manager = ProviderManager.getInstance();
    manager.setReasoningEffort('medium');
    new ProviderManager(path.join(root, 'providers.json')).setReasoningEffort(
      'high',
    );
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    const context = createMockCommandContext();
    await expect(
      effortCommand.action!(context, 'ultra'),
    ).resolves.toBeUndefined();
    expect(context.ui.addItem).toHaveBeenCalledTimes(1);
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text: expect.stringContaining(
          locale === 'zh' ? '推理强度未保存' : 'Reasoning effort was not saved',
        ),
      }),
    );
    expect(manager.getReasoningEffort()).toBe('medium');
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(before);
  },
);

it('keeps a failed filesystem save private and permits an explicit retry after recovery', async () => {
  I18nManager.getInstance().setLocale('en');
  const manager = ProviderManager.getInstance();
  manager.setReasoningEffort('medium');
  const file = path.join(root, 'providers.json');
  fs.mkdirSync(file + '.bak');
  const context = createMockCommandContext();
  await expect(effortCommand.action!(context, 'low')).resolves.toBeUndefined();
  expect(manager.getReasoningEffort()).toBe('medium');
  expect(
    JSON.stringify(vi.mocked(context.ui.addItem).mock.calls),
  ).not.toContain(root);
  fs.rmdirSync(file + '.bak');
  await effortCommand.action!(context, 'low');
  expect(manager.getReasoningEffort()).toBe('low');
  expect(context.ui.addItem).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'info',
      text: 'Reasoning effort updated: low',
    }),
  );
});
