/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { langCommand } from './langCommand.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-language-save-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['zh', 'en'] as const)(
  'keeps %s after a failed save, reports locally without paths and retries after recovery',
  async (locale) => {
    const i18n = I18nManager.getInstance();
    i18n.setLocale(locale);
    const file = path.join(root, 'locale.json');
    fs.renameSync(file, file + '.original');
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, 'marker'), 'preserve');
    const listener = vi.fn();
    const unsubscribe = i18n.subscribe(listener);
    const context = createMockCommandContext();
    const target = locale === 'zh' ? 'en' : 'zh';
    try {
      await expect(
        langCommand.action!(context, target),
      ).resolves.toBeUndefined();
      expect(i18n.getLocale()).toBe(locale);
      expect(context.ui.reloadCommands).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: expect.stringContaining(
            locale === 'zh'
              ? '语言设置未保存'
              : 'Language preference was not saved',
          ),
        }),
      );
      expect(
        JSON.stringify(vi.mocked(context.ui.addItem).mock.calls),
      ).not.toContain(root);
      expect(fs.readFileSync(path.join(file, 'marker'), 'utf8')).toBe(
        'preserve',
      );
      expect(fs.readdirSync(root).some((name) => name.endsWith('.tmp'))).toBe(
        false,
      );
      fs.unlinkSync(path.join(file, 'marker'));
      fs.rmdirSync(file);
      fs.renameSync(file + '.original', file);
      await langCommand.action!(context, target);
      expect(i18n.getLocale()).toBe(target);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(context.ui.reloadCommands).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).locale).toBe(target);
      expect(context.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'info' }),
      );
    } finally {
      unsubscribe();
    }
  },
);
