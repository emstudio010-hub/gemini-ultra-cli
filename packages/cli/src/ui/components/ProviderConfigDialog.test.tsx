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

it.each(['parameter', 'models'] as const)(
  'keeps a selected non-default model when saving %s',
  async (operation) => {
    const manager = ProviderManager.getInstance();
    const provider = manager.upsertProvider({
      name: 'Fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: 'FAKE_ONLY',
      models: ['default-model', 'selected-model'],
      defaultModel: 'default-model',
    });
    manager.setActiveSelection(provider.id, 'selected-model');
    manager.upsertProvider({
      ...manager.getProviderById(provider.id)!,
      defaultModel: 'default-model',
      setActive: false,
    });
    const onClose = vi.fn();
    const view = await renderWithProviders(
      <ProviderConfigDialog onClose={onClose} />,
    );
    const key = async (sequence: string) =>
      act(async () => {
        view.stdin.write(sequence);
        await view.waitUntilReady();
      });
    try {
      for (let index = 0; index < (operation === 'parameter' ? 8 : 2); index++)
        await key('\u001b[B');
      await key('\r');
      if (operation === 'parameter') await key('2048');
      await key('\r');
      await waitFor(() =>
        expect(view.lastFrame()).toContain(
          operation === 'parameter' ? 'Output limit updated' : 'Models saved',
        ),
      );
      expect(manager.getActiveModel()).toBe('selected-model');
      expect(manager.getProviderById(provider.id)?.defaultModel).toBe(
        'default-model',
      );
      await key('\u001b');
      await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
    } finally {
      view.unmount();
    }
  },
);

it('rejects a stale parameter save without losing input, then reloads the current profile on return', async () => {
  const manager = ProviderManager.getInstance();
  const provider = manager.upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ORIGINAL',
    models: ['old-model'],
  });
  const view = await renderWithProviders(
    <ProviderConfigDialog onClose={vi.fn()} />,
  );
  const key = async (sequence: string) =>
    act(async () => {
      view.stdin.write(sequence);
      await view.waitUntilReady();
    });
  try {
    for (let index = 0; index < 8; index++) await key('\u001b[B');
    await key('\r');
    await key('2048');
    manager.upsertProvider({
      ...provider,
      apiKey: 'FAKE_UPDATED',
      models: ['new-default', 'new-selected'],
      defaultModel: 'new-default',
      maxOutputTokens: 512,
      contextWindow: 16384,
      setActive: false,
    });
    manager.setActiveSelection(provider.id, 'new-selected');
    const updated = manager.getProviderById(provider.id)!;
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    await key('\r');
    await waitFor(() =>
      expect(view.lastFrame()).toContain('changed in another view'),
    );
    expect(view.lastFrame()).toContain('2048');
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(before);
    await key('\u001b');
    await key('\r');
    await waitFor(() => expect(view.lastFrame()).toContain('512'));
    for (let index = 0; index < 3; index++) await key('\u007f');
    await key('1024');
    await key('\r');
    await waitFor(() =>
      expect(view.lastFrame()).toContain('Output limit updated'),
    );
    expect(manager.getProviderById(provider.id)).toMatchObject({
      ...updated,
      maxOutputTokens: 1024,
      updatedAt: expect.any(String),
    });
    expect(manager.getActiveModel()).toBe('new-selected');
  } finally {
    view.unmount();
  }
});

it.each(['en', 'zh'] as const)(
  'edits another configuration target without activating it in %s',
  async (locale) => {
    I18nManager.getInstance().setLocale(locale);
    const manager = ProviderManager.getInstance();
    const first = manager.upsertProvider({
      name: 'First',
      baseUrl: 'https://first.invalid/v1',
      apiKey: 'FAKE_FIRST',
      models: ['first-model'],
    });
    const second = manager.upsertProvider({
      name: 'Second',
      baseUrl: 'https://second.invalid/v1',
      apiKey: 'FAKE_SECOND',
      models: ['second-model'],
      setActive: false,
    });
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    const onClose = vi.fn();
    const view = await renderWithProviders(
      <ProviderConfigDialog onClose={onClose} />,
    );
    const key = async (sequence: string) =>
      act(async () => {
        view.stdin.write(sequence);
        await view.waitUntilReady();
      });
    try {
      expect(view.lastFrame()).toContain(
        locale === 'zh' ? '不激活供应商' : 'without activating it',
      );
      await key('\u001b[D'); // Wrap from First to Second.
      await waitFor(() =>
        expect(view.lastFrame()).toContain(
          locale === 'zh'
            ? '当前配置目标: Second'
            : 'Configuration Target: Second',
        ),
      );
      expect(view.lastFrame()).toContain(
        locale === 'zh'
          ? '保存的默认供应商: First'
          : 'saved active provider: First',
      );
      expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
        before,
      );
      for (let index = 0; index < 8; index++) await key('\u001b[B');
      await key('\r');
      await key('4096');
      await key('\r');
      await waitFor(() =>
        expect(manager.getProviderById(second.id)?.maxOutputTokens).toBe(4096),
      );
      expect(
        manager.getProviderById(first.id)?.maxOutputTokens,
      ).toBeUndefined();
      expect(manager.getActiveProvider()?.id).toBe(first.id);
      expect(manager.getActiveModel()).toBe('first-model');
      await key('\u001b[C'); // Wrap from Second back to First.
      await waitFor(() =>
        expect(view.lastFrame()).toContain(
          locale === 'zh'
            ? '当前配置目标: First'
            : 'Configuration Target: First',
        ),
      );
      await key('\u001b');
      expect(onClose).toHaveBeenCalledWith(false);
    } finally {
      view.unmount();
    }
  },
);

it.each([
  'escape',
  'exit',
  'parameter-edit',
  'activate-same',
  'model-removal',
] as const)(
  'only requests live route synchronization after actual selection intent or change: %s',
  async (operation) => {
    const manager = ProviderManager.getInstance();
    const provider = manager.upsertProvider({
      name: 'Fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: 'FAKE_DIALOG_ONLY',
      models: ['primary', 'other'],
      defaultModel: 'primary',
    });
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    const onClose = vi.fn();
    const view = await renderWithProviders(
      <ProviderConfigDialog onClose={onClose} />,
    );
    const key = async (sequence: string) =>
      act(async () => {
        view.stdin.write(sequence);
        await view.waitUntilReady();
      });
    try {
      if (operation === 'exit') {
        await key('\u001b[A');
        await key('\r');
      } else if (operation === 'parameter-edit') {
        for (let index = 0; index < 8; index++) await key('\u001b[B');
        await key('\r');
        await waitFor(() => expect(view.lastFrame()).toContain('Output Limit'));
        await key('2048');
        await key('\r');
        await waitFor(() =>
          expect(view.lastFrame()).toContain('Output limit updated'),
        );
        await key('\u001b');
      } else if (operation === 'activate-same') {
        await key('\r');
        await key('\r');
        await waitFor(() =>
          expect(view.lastFrame()).toContain('Activated provider'),
        );
        await key('\u001b');
      } else if (operation === 'model-removal') {
        await key('\u001b[B');
        await key('\u001b[B');
        await key('\r');
        await waitFor(() =>
          expect(view.lastFrame()).toContain('Model Checklist'),
        );
        await key(' ');
        await key('\r');
        await waitFor(() => expect(view.lastFrame()).toContain('Models saved'));
        await key('\u001b');
      } else await key('\u001b');
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledWith(
        operation === 'activate-same' || operation === 'model-removal',
      );
      if (operation === 'parameter-edit')
        expect(manager.getProviderById(provider.id)?.maxOutputTokens).toBe(
          2048,
        );
      if (operation === 'escape' || operation === 'exit')
        expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
          before,
        );
      expect(manager.getActiveModel()).toBe(
        operation === 'model-removal' ? 'other' : 'primary',
      );
    } finally {
      view.unmount();
    }
  },
);

it.each(['delete', 'save-models', 'refresh-models'] as const)(
  'keeps a same-name provider intact when the open %s target ID has been deleted',
  async (operation) => {
    const manager = ProviderManager.getInstance();
    const other = manager.upsertProvider({
      name: 'Alpha',
      baseUrl: 'https://other.invalid/v1',
      apiKey: 'FAKE_OTHER',
      models: ['other-model'],
    });
    const target = manager.upsertProvider({
      name: 'Research',
      baseUrl: 'https://target.invalid/v1',
      apiKey: 'FAKE_TARGET',
      models: ['target-model'],
    });
    manager.upsertProvider({
      ...target,
      name: 'Research Gateway',
      setActive: true,
    });
    manager.upsertProvider({ ...other, name: 'Research', setActive: false });
    const fetch = vi
      .spyOn(manager, 'fetchModelsFromEndpoint')
      .mockResolvedValue({ models: ['unexpected-model'] });
    const rendered = await renderWithProviders(
      <ProviderConfigDialog onClose={vi.fn()} />,
    );
    const key = async (sequence: string) =>
      act(async () => {
        rendered.stdin.write(sequence);
        await rendered.waitUntilReady();
      });
    try {
      for (let index = 0; index < (operation === 'delete' ? 6 : 2); index++)
        await key('\u001b[B');
      await key('\r');
      await waitFor(() =>
        expect(rendered.lastFrame()).toContain(
          operation === 'delete'
            ? 'Warning: Delete provider'
            : 'Model Checklist',
        ),
      );
      manager.removeProvider(target.id);
      const before = fs.readFileSync(path.join(root, 'providers.json'));
      await key(operation === 'refresh-models' ? '\u0012' : '\r');
      await waitFor(() =>
        expect(rendered.lastFrame()).toContain('Provider no longer exists'),
      );
      expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
        before,
      );
      expect(manager.listProviders()).toHaveLength(1);
      expect(manager.listProviders()[0]).toMatchObject({
        id: other.id,
        models: ['other-model'],
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(rendered.lastFrame()).toContain(
        operation === 'delete' ? 'Warning: Delete provider' : 'Model Checklist',
      );
    } finally {
      rendered.unmount();
    }
  },
);

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
