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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-refresh-'));
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

async function open() {
  const manager = ProviderManager.getInstance();
  const provider = manager.upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_REFRESH_KEY',
    models: ['first', 'preferred'],
    defaultModel: 'preferred',
    customHeaders: { 'X-Fixture': 'retained' },
  });
  const before = fs.readFileSync(path.join(root, 'providers.json'));
  const rendered = await renderWithProviders(
    <ProviderConfigDialog onClose={vi.fn()} />,
  );
  const key = async (input: string) => {
    await act(async () => {
      rendered.stdin.write(input);
      await rendered.waitUntilReady();
    });
  };
  await key('\u001b[B');
  await key('\u001b[B');
  await key('\r');
  await waitFor(() =>
    expect(rendered.lastFrame()).toContain('Model Checklist'),
  );
  return { manager, provider, before, rendered, key };
}

it('refreshes on demand without selecting new remote models or losing pending custom input and deselections', async () => {
  const view = await open();
  const fetch = vi
    .spyOn(view.manager, 'fetchModelsFromEndpoint')
    .mockResolvedValue({ models: ['preferred', 'remote-new', 'remote-new'] });
  try {
    await view.key(' '); // Unselect first, keeping the original default.
    await view.key('manual-local');
    expect(fetch).not.toHaveBeenCalled();
    await view.key('\u0012'); // Ctrl+R
    await waitFor(() =>
      expect(view.rendered.lastFrame()).toContain('remote-new'),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        customHeaders: { 'X-Fixture': 'retained' },
        protocol: 'openai-chat',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      view.before,
    );
    expect(view.rendered.lastFrame()).toContain('manual-local');
    await view.key('\r');
    await waitFor(() =>
      expect(view.rendered.lastFrame()).toContain('Models saved'),
    );
    expect(view.manager.getProvider(view.provider.id)?.models).toEqual([
      'manual-local',
      'preferred',
    ]);
    expect(view.manager.getActiveModel()).toBe('preferred');
  } finally {
    view.rendered.unmount();
  }
});

it('keeps saved and pending choices after a failed refresh and allows manual saving', async () => {
  const view = await open();
  vi.spyOn(view.manager, 'fetchModelsFromEndpoint').mockResolvedValue({
    models: [],
    error: 'Model discovery timed out.',
  });
  try {
    await view.key('manual-local');
    await view.key('\u0012');
    await waitFor(() =>
      expect(view.rendered.lastFrame()).toContain(
        'Notice: Model discovery timed out.',
      ),
    );
    expect(view.rendered.lastFrame()).not.toContain('提示');
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      view.before,
    );
    await view.key('\r');
    await waitFor(() =>
      expect(view.rendered.lastFrame()).toContain('Models saved'),
    );
    expect(view.manager.getProvider(view.provider.id)?.models).toEqual([
      'manual-local',
      'first',
      'preferred',
    ]);
    expect(view.manager.getActiveModel()).toBe('preferred');
  } finally {
    view.rendered.unmount();
  }
});

it('coalesces repeated refresh keys and ignores a late result after leaving the checklist', async () => {
  const view = await open();
  let resolve!: (result: { models: string[] }) => void;
  let signal: AbortSignal | undefined;
  const fetch = vi
    .spyOn(view.manager, 'fetchModelsFromEndpoint')
    .mockImplementation(async (params) => {
      signal = params.signal;
      return new Promise((done) => {
        resolve = done;
      });
    });
  try {
    await view.key('\u0012');
    await view.key('\u0012');
    expect(fetch).toHaveBeenCalledTimes(1);
    await view.key('\u001b');
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolve({ models: ['LATE_REMOTE_RESULT'] });
      await view.rendered.waitUntilReady();
    });
    expect(view.rendered.lastFrame()).toContain('Provider Configuration Menu');
    expect(view.rendered.lastFrame()).not.toContain('LATE_REMOTE_RESULT');
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      view.before,
    );
  } finally {
    view.rendered.unmount();
  }
});
