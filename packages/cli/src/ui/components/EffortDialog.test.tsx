/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager, ProviderManager } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { EffortDialog } from './EffortDialog.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-effort-dialog-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('saves the selected level with the actual Enter key emitted by the terminal parser', async () => {
  I18nManager.getInstance().setLocale('en');
  const manager = ProviderManager.getInstance();
  manager.setReasoningEffort('medium');
  const onClose = vi.fn();
  const rendered = await renderWithProviders(
    <EffortDialog onClose={onClose} />,
  );
  try {
    await act(async () => {
      rendered.stdin.write('\u001b[B');
      await rendered.waitUntilReady();
    });
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(manager.getReasoningEffort()).toBe('high');
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'providers.json'), 'utf8'))
        .reasoningEffort,
    ).toBe('high');
  } finally {
    rendered.unmount();
  }
});

it('shows a save error in the dialog, preserves current effort and still handles Escape', async () => {
  I18nManager.getInstance().setLocale('en');
  const manager = ProviderManager.getInstance();
  manager.setReasoningEffort('medium');
  const onClose = vi.fn();
  const rendered = await renderWithProviders(
    <EffortDialog onClose={onClose} />,
  );
  try {
    new ProviderManager(path.join(root, 'providers.json')).setReasoningEffort(
      'high',
    );
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('Reasoning effort was not saved'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(manager.getReasoningEffort()).toBe('medium');
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(before);
    await act(async () => {
      rendered.stdin.write('\u001b');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  } finally {
    rendered.unmount();
  }
});
