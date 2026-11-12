/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { I18nManager } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { LanguageDialog } from './LanguageDialog.js';

it('keeps the language picker usable after a failed Enter save and retries in place after recovery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-language-dialog-'));
  const file = path.join(root, 'locale.json');
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', file);
  const i18n = I18nManager.getInstance();
  i18n.setLocale('en');
  const onClose = vi.fn();
  const rendered = await renderWithProviders(
    <LanguageDialog onClose={onClose} />,
  );
  try {
    fs.renameSync(file, file + '.original');
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, 'marker'), 'preserve');
    await act(async () => {
      rendered.stdin.write('\u001b[A');
      await rendered.waitUntilReady();
    });
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain(
        'Language preference was not saved',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(i18n.getLocale()).toBe('en');
    expect(rendered.lastFrame()).not.toContain(root);
    fs.unlinkSync(path.join(file, 'marker'));
    fs.rmdirSync(file);
    fs.renameSync(file + '.original', file);
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(i18n.getLocale()).toBe('zh');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).locale).toBe('zh');
  } finally {
    rendered.unmount();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
