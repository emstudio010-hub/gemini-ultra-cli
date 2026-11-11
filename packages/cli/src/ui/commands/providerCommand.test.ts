/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  I18nManager,
  ProviderManager,
  type Config,
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { providerCommand } from './providerCommand.js';

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-command-'));
  file = path.join(root, 'providers.json');
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', file);
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
function setup() {
  let sessionModel = 'first:shared-model';
  const setModel = vi.fn((model: string) => {
    sessionModel = model;
  });
  const context = createMockCommandContext({
    services: {
      agentContext: { config: { setModel } as unknown as Config },
    },
  });
  const mgr = ProviderManager.getInstance();
  for (const name of ['First', 'Second'])
    mgr.upsertProvider({
      name,
      baseUrl: `https://${name.toLowerCase()}.invalid/v1`,
      apiKey: 'fixture-only',
      models: ['shared-model'],
      setActive: name === 'First',
    });
  return { mgr, context, setModel, sessionModel: () => sessionModel };
}
const run = (
  context: ReturnType<typeof createMockCommandContext>,
  args: string,
) => providerCommand.action!(context, args);

it('reports a stale save locally and reloads current settings when reopening the provider dialog', async () => {
  const { mgr, context, setModel } = setup();
  const other = new ProviderManager(file);
  other.upsertProvider({
    name: 'Other CLI',
    baseUrl: 'https://other.invalid/v1',
    apiKey: 'FAKE_OTHER_KEY',
    models: ['other-model'],
    setActive: false,
  });
  const disk = fs.readFileSync(file);
  await run(context, 'use Second');
  expect(setModel).not.toHaveBeenCalled();
  expect(fs.readFileSync(file)).toEqual(disk);
  expect(JSON.stringify(vi.mocked(context.ui.addItem).mock.calls)).toContain(
    'Reopen /provider',
  );
  expect(
    JSON.stringify(vi.mocked(context.ui.addItem).mock.calls),
  ).not.toContain('FAKE_OTHER_KEY');
  const result = await run(context, '');
  expect(result).toMatchObject({ type: 'custom_dialog' });
  expect(mgr.getProvider('Other CLI')).toBeDefined();
  await run(context, 'use Second');
  expect(setModel).toHaveBeenCalledWith('second:shared-model');
  expect(new ProviderManager(file).getProvider('Other CLI')).toBeDefined();
});

it('switches the live qualified session route as well as the persisted active provider', async () => {
  const { mgr, context, sessionModel } = setup();
  await run(context, 'use Second');
  expect(mgr.getActiveProvider()?.id).toBe('second');
  expect(mgr.resolveProviderForModel(sessionModel())?.provider.id).toBe(
    'second',
  );
  expect(context.ui.reloadCommands).toHaveBeenCalled();
});

it('adds a manually named model without catalog discovery and synchronizes its live route', async () => {
  const { mgr, context, sessionModel } = setup();
  const catalog = vi
    .spyOn(mgr, 'fetchModelsFromEndpoint')
    .mockResolvedValue({ models: [] });
  await run(
    context,
    'add Manual https://manual.invalid/v1 fixture-key custom-model',
  );
  expect(catalog).not.toHaveBeenCalled();
  expect(mgr.resolveProviderForModel(sessionModel())).toMatchObject({
    provider: { id: 'manual' },
    modelId: 'custom-model',
  });
  expect(
    JSON.stringify(vi.mocked(context.ui.addItem).mock.calls),
  ).not.toContain('fixture-key');
});

it('retains configuration bytes and the live model when catalog discovery fails', async () => {
  const { mgr, context, setModel } = setup();
  const before = fs.readFileSync(file);
  vi.spyOn(mgr, 'fetchModelsFromEndpoint').mockResolvedValue({
    models: [],
    error: 'Model discovery timed out.',
  });
  await run(context, 'add Missing https://missing.invalid/v1 fixture-key');
  expect(fs.readFileSync(file)).toEqual(before);
  expect(setModel).not.toHaveBeenCalled();
  expect(context.ui.addItem).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'error',
      text: expect.stringContaining('model'),
    }),
  );
});

it('preserves an existing provider catalog when manually setting a new default model', async () => {
  const { mgr, context, sessionModel } = setup();
  const catalog = vi
    .spyOn(mgr, 'fetchModelsFromEndpoint')
    .mockResolvedValue({ models: [] });
  await run(
    context,
    'add First https://first.invalid/v1 fixture-key new-model',
  );
  expect(catalog).not.toHaveBeenCalled();
  expect(mgr.getProvider('First')?.models).toEqual([
    'shared-model',
    'new-model',
  ]);
  expect(sessionModel()).toBe('first:new-model');
});

it('does not update the live route or report success if persistence fails', async () => {
  const { mgr, context, setModel } = setup();
  vi.spyOn(mgr, 'setActiveSelection').mockImplementation(() => {
    throw new Error('fixture disk failure');
  });
  await expect(run(context, 'use Second')).resolves.toBeUndefined();
  expect(setModel).not.toHaveBeenCalled();
  expect(mgr.getActiveProvider()?.id).toBe('first');
  expect(context.ui.addItem).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'error' }),
  );
});

it('changes provider command descriptions and list labels with the current locale', async () => {
  const { context } = setup();
  expect(providerCommand.description).toContain('provider');
  await run(context, 'list');
  expect(context.ui.addItem).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Configured providers'),
    }),
  );
  I18nManager.getInstance().setLocale('zh');
  expect(providerCommand.description).toContain('供应商');
  await run(context, 'list');
  expect(context.ui.addItem).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('已配置'),
    }),
  );
});
