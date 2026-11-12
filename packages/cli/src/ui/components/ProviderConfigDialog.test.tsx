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
import { ProviderConfigDialog } from './ProviderConfigDialog.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-dialog-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  ProviderManager.resetInstance();
  I18nManager.getInstance().setLocale('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([false, true])(
  'preserves a retained non-first default when saving the checklist, active=%s',
  async (active) => {
    const manager = ProviderManager.getInstance();
    const provider = manager.upsertProvider({
      name: 'Fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: 'FAKE_DIALOG_KEY',
      models: ['first-model', 'preferred-model'],
      defaultModel: 'preferred-model',
      setActive: active,
    });
    const fetch = vi.spyOn(manager, 'fetchModelsFromEndpoint');
    const rendered = await renderWithProviders(
      <ProviderConfigDialog onClose={vi.fn()} />,
    );
    try {
      for (let i = 0; i < 2; i++)
        await act(async () => {
          rendered.stdin.write('\u001b[B');
          await rendered.waitUntilReady();
        });
      await act(async () => {
        rendered.stdin.write('\r');
        await rendered.waitUntilReady();
      });
      await waitFor(() =>
        expect(rendered.lastFrame()).toContain('Model Checklist'),
      );
      await act(async () => {
        rendered.stdin.write('\r');
        await rendered.waitUntilReady();
      });
      await waitFor(() =>
        expect(rendered.lastFrame()).toContain('Models saved'),
      );
      expect(manager.getProvider(provider.id)?.defaultModel).toBe(
        'preferred-model',
      );
      expect(manager.getProvider(provider.id)?.models).toEqual([
        'first-model',
        'preferred-model',
      ]);
      if (active) expect(manager.getActiveModel()).toBe('preferred-model');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      rendered.unmount();
    }
  },
);

it('chooses a remaining model when the current default is explicitly deselected', async () => {
  const manager = ProviderManager.getInstance();
  const provider = manager.upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: '',
    models: ['first-model', 'preferred-model'],
    defaultModel: 'preferred-model',
  });
  const rendered = await renderWithProviders(
    <ProviderConfigDialog onClose={vi.fn()} />,
  );
  try {
    for (let i = 0; i < 2; i++)
      await act(async () => {
        rendered.stdin.write('\u001b[B');
        await rendered.waitUntilReady();
      });
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('Model Checklist'),
    );
    await act(async () => {
      rendered.stdin.write('\u001b[B');
      await rendered.waitUntilReady();
    });
    await act(async () => {
      rendered.stdin.write(' ');
      await rendered.waitUntilReady();
    });
    await act(async () => {
      rendered.stdin.write('\r');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(rendered.lastFrame()).toContain('Models saved'));
    expect(manager.getProvider(provider.id)?.models).toEqual(['first-model']);
    expect(manager.getProvider(provider.id)?.defaultModel).toBe('first-model');
    expect(manager.getActiveModel()).toBe('first-model');
  } finally {
    rendered.unmount();
  }
});
