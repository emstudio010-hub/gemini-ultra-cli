/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProviderManager, I18nManager } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ProviderConfigDialog } from './ProviderConfigDialog.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-empty-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  ProviderManager.resetInstance();
  I18nManager.getInstance().setLocale('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  expect(path.dirname(root)).toBe(os.tmpdir());
  expect(path.basename(root)).toMatch(/^ultra-provider-empty-/);
  fs.rmSync(root, { recursive: true, force: true });
});
async function open() {
  const onClose = vi.fn();
  const view = await renderWithProviders(
    <ProviderConfigDialog onClose={onClose} />,
  );
  const key = async (sequence: string) =>
    act(async () => {
      view.stdin.write(sequence);
      await view.waitUntilReady();
    });
  const fill = async () => {
    await key('Replacement');
    await key('\r');
    await key('https://replacement.invalid/v1');
    await key('\r');
    await key('FAKE_ONLY');
    await key('\r');
    await key('\r');
    await waitFor(() => expect(view.lastFrame()).toContain('Model Checklist'));
  };
  return { view, key, onClose, fill };
}
it('creates a manual model from empty configuration without contacting the endpoint', async () => {
  const manager = ProviderManager.getInstance();
  const fetch = vi
    .spyOn(manager, 'fetchModelsFromEndpoint')
    .mockResolvedValue({ models: ['UNREQUESTED_REMOTE'] });
  const { view, key, fill, onClose } = await open();
  try {
    await fill();
    expect(fetch).not.toHaveBeenCalled();
    expect(manager.listProviders()).toHaveLength(0);
    expect(view.lastFrame()).toContain('No endpoint connection');
    await key('manual-model');
    await key('\r');
    await waitFor(() =>
      expect(view.lastFrame()).toContain('created & activated'),
    );
    expect(manager.getActiveProvider()?.models).toEqual(['manual-model']);
    await key('\u001b');
    expect(onClose).toHaveBeenCalledWith(true);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});
it('fetches only on explicit Ctrl+R and cancels a new unsaved provider without losing its draft or persisting secrets', async () => {
  const manager = ProviderManager.getInstance();
  let release!: (result: { models: string[] }) => void;
  let signal: AbortSignal | undefined;
  const fetch = vi
    .spyOn(manager, 'fetchModelsFromEndpoint')
    .mockImplementation(async (params) => {
      signal = params.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
  const { view, key, fill, onClose } = await open();
  try {
    await fill();
    await key('manual-draft');
    expect(fetch).not.toHaveBeenCalled();
    await key('\u0012');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(view.lastFrame()).toContain('manual-draft');
    await key('\u001b');
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      release({ models: ['LATE_REMOTE'] });
      await view.waitUntilReady();
    });
    expect(view.lastFrame()).not.toContain('LATE_REMOTE');
    await key('\u001b');
    expect(onClose).toHaveBeenCalledWith(false);
    expect(manager.listProviders()).toHaveLength(0);
    expect(fs.existsSync(path.join(root, 'providers.json'))).toBe(false);
  } finally {
    view.unmount();
  }
});
it('goes straight to a clean add form after deleting the last provider and permits a manual replacement', async () => {
  const manager = ProviderManager.getInstance();
  const original = manager.upsertProvider({
    name: 'Last',
    baseUrl: 'https://last.invalid/v1',
    apiKey: 'FAKE_OLD',
    models: ['old-model'],
  });
  const fetch = vi
    .spyOn(manager, 'fetchModelsFromEndpoint')
    .mockResolvedValue({ models: [] });
  const { view, key, fill, onClose } = await open();
  try {
    for (let index = 0; index < 6; index++) await key('\u001b[B');
    await key('\r');
    await key('\r');
    await waitFor(() => expect(view.lastFrame()).toContain('Endpoint & Key'));
    expect(manager.listProviders()).toHaveLength(0);
    expect(view.lastFrame()).not.toContain('https://last.invalid');
    await fill();
    await key('replacement-model');
    await key('\r');
    await waitFor(() =>
      expect(manager.getActiveModel()).toBe('replacement-model'),
    );
    expect(manager.getProviderById(original.id)).toBeUndefined();
    expect(manager.getActiveProvider()?.name).toBe('Replacement');
    await key('\u001b');
    expect(onClose).toHaveBeenCalledWith(true);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});
