/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AuthType,
  I18nManager,
  ProviderManager,
  preflightSkillTools,
  type SkillDefinition,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockConfig } from '../../test-utils/mockConfig.js';
import { waitFor } from '../../test-utils/async.js';
import { SkillSpecialSessionDialog } from './SkillSpecialSessionDialog.js';

vi.mock('@google/gemini-cli-core', async (original) => ({
  ...(await original<typeof import('@google/gemini-cli-core')>()),
  preflightSkillTools: vi.fn().mockResolvedValue({
    domain: 'specialized-domain',
    readyTools: [],
    missingTools: [],
  }),
}));
let root: string;
const skill: SkillDefinition = {
  name: 'fixture',
  description: 'Fixture instructions',
  body: 'Keep this exact instruction.',
  location: '/fixture/SKILL.md',
};
beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-skill-dialog-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  I18nManager.getInstance().setLocale('en');
  const manager = ProviderManager.getInstance();
  manager.upsertProvider({
    name: 'local',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: '',
    models: ['fixture'],
    setActive: true,
  });
  manager.setReasoningEffort('max');
});
afterEach(() => {
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
const renderDialog = async (onConfirm = vi.fn(), onCancel = vi.fn()) => {
  const config = createMockConfig({
    getModel: () => 'local:fixture',
    getContentGeneratorConfig: () => ({ authType: AuthType.GATEWAY }),
  });
  const rendered = await renderWithProviders(
    <SkillSpecialSessionDialog
      skill={skill}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
    { config },
  );
  const key = async (value: string) => {
    await act(async () => {
      rendered.stdin.write(value);
      await rendered.waitUntilReady();
    });
  };
  return { ...rendered, key, onConfirm, onCancel };
};
it('accepts actual terminal Enter for both steps and retains the current gateway model', async () => {
  const rendered = await renderDialog();
  try {
    await rendered.key('\r');
    await rendered.key('\r');
    await waitFor(() =>
      expect(rendered.onConfirm).toHaveBeenCalledWith('local:fixture', 'max'),
    );
  } finally {
    rendered.unmount();
  }
});
it('previews all six levels including Ultra without writing the provider file on Tab or cancel', async () => {
  const before = fs.readFileSync(path.join(root, 'providers.json'));
  const rendered = await renderDialog();
  try {
    await rendered.key('y');
    await rendered.key('\t');
    expect(rendered.lastFrame()).toContain('Ultra');
    expect(ProviderManager.getInstance().getReasoningEffort()).toBe('max');
    expect(
      fs.readFileSync(path.join(root, 'providers.json')).equals(before),
    ).toBe(true);
    await rendered.key('\x1b');
    await waitFor(() => expect(rendered.onCancel).toHaveBeenCalledOnce());
    expect(rendered.onConfirm).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(path.join(root, 'providers.json')).equals(before),
    ).toBe(true);
  } finally {
    rendered.unmount();
  }
});

it('keeps draft choices across language changes and inspects tools only on request', async () => {
  const rendered = await renderDialog();
  try {
    expect(preflightSkillTools).not.toHaveBeenCalled();
    await rendered.key('\r');
    await rendered.key('\t');
    await act(async () => {
      I18nManager.getInstance().setLocale('zh');
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('推理强度：极尽详尽'),
    );
    expect(rendered.lastFrame()).not.toContain('Reasoning effort');
    await rendered.key('p');
    await waitFor(() => expect(preflightSkillTools).toHaveBeenCalledOnce());
    await rendered.key('\r');
    await waitFor(() =>
      expect(rendered.onConfirm).toHaveBeenCalledWith('local:fixture', 'ultra'),
    );
  } finally {
    rendered.unmount();
  }
});

it('catches async activation failure, blocks duplicate Enter while pending and allows retry', async () => {
  let reject!: (error: Error) => void;
  const onConfirm = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  const rendered = await renderDialog(onConfirm);
  try {
    await rendered.key('\r');
    await rendered.key('\r');
    await rendered.key('\r');
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {
      reject(new Error('PRIVATE_DETAIL'));
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('was not activated'),
    );
    expect(rendered.lastFrame()).not.toContain('PRIVATE_DETAIL');
    expect(rendered.onCancel).not.toHaveBeenCalled();
    await rendered.key('\r');
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  } finally {
    rendered.unmount();
  }
});

it('cancels replaced and unmounted inspections and ignores late reports', async () => {
  const pending: Array<{
    signal: AbortSignal;
    locale: string;
    resolve: (value: Awaited<ReturnType<typeof preflightSkillTools>>) => void;
  }> = [];
  vi.mocked(preflightSkillTools).mockImplementation(
    (_domain, signal, locale) =>
      new Promise((resolve) => {
        pending.push({ signal: signal!, locale: locale!, resolve });
      }),
  );
  const rendered = await renderDialog();
  try {
    await rendered.key('p');
    await waitFor(() => expect(pending).toHaveLength(1));
    await rendered.key('p');
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => {
      pending[0].resolve({
        domain: 'specialized-domain',
        readyTools: [{ name: 'STALE_TOOL', detail: 'late report' }],
        missingTools: [],
      });
    });
    expect(rendered.lastFrame()).not.toContain('STALE_TOOL');
    await act(async () => {
      I18nManager.getInstance().setLocale('zh');
    });
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[1].signal.aborted).toBe(true);
    expect(pending[2].locale).toBe('zh');
    expect(pending[2].signal.aborted).toBe(false);
  } finally {
    rendered.unmount();
    expect(pending.at(-1)?.signal.aborted).toBe(true);
    vi.mocked(preflightSkillTools).mockResolvedValue({
      domain: 'specialized-domain',
      readyTools: [],
      missingTools: [],
    });
  }
});
