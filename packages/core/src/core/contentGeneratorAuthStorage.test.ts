/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import { ProviderManager } from '../providers/providerManager.js';
import { loadApiKey } from './apiKeyCredentialStorage.js';
import { AuthType, createContentGeneratorConfig } from './contentGenerator.js';

vi.mock('./apiKeyCredentialStorage.js', () => ({ loadApiKey: vi.fn() }));

let config: Config & { env: Record<string, string> };
beforeEach(() => {
  vi.spyOn(ProviderManager, 'getInstance').mockReturnValue({
    getActiveProvider: () => undefined,
  } as ProviderManager);
  vi.mocked(loadApiKey).mockReset();
  config = {
    getProxy: () => undefined,
    env: {
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      GOOGLE_CLOUD_PROJECT: '',
      GOOGLE_CLOUD_PROJECT_ID: '',
      GOOGLE_CLOUD_LOCATION: '',
    },
  } as unknown as typeof config;
});
afterEach(() => vi.restoreAllMocks());

it.each([
  {
    label: 'Vertex API key',
    auth: AuthType.USE_VERTEX_AI,
    env: { GOOGLE_API_KEY: 'fixture-vertex-key' },
    expected: { apiKey: 'fixture-vertex-key', vertexai: true },
  },
  {
    label: 'Vertex project credentials',
    auth: AuthType.USE_VERTEX_AI,
    env: {
      GOOGLE_CLOUD_PROJECT: 'fixture-project',
      GOOGLE_CLOUD_LOCATION: 'us',
    },
    expected: { apiKey: undefined, vertexai: true },
  },
  {
    label: 'gateway without a saved provider',
    auth: AuthType.GATEWAY,
    env: {},
    expected: { apiKey: '', vertexai: false },
  },
])(
  'creates $label configuration without touching Gemini credential storage',
  async ({ auth, env, expected }) => {
    Object.assign(config.env, env);
    vi.mocked(loadApiKey).mockRejectedValue(
      new Error('Gemini keychain unavailable'),
    );
    const result = await createContentGeneratorConfig(config, auth);
    expect(result).toMatchObject({ ...expected, authType: auth });
    expect(loadApiKey).not.toHaveBeenCalled();
  },
);

it('still reads the saved Gemini key when Gemini API authentication needs it', async () => {
  vi.mocked(loadApiKey).mockResolvedValue('fixture-saved-key');
  const result = await createContentGeneratorConfig(
    config,
    AuthType.USE_GEMINI,
  );
  expect(result).toMatchObject({
    apiKey: 'fixture-saved-key',
    vertexai: false,
  });
  expect(loadApiKey).toHaveBeenCalledOnce();
});

it('preserves explicit and environment Gemini key precedence without storage access', async () => {
  config.env['GEMINI_API_KEY'] = 'fixture-env-key';
  vi.mocked(loadApiKey).mockRejectedValue(
    new Error('Gemini keychain unavailable'),
  );
  const explicit = await createContentGeneratorConfig(
    config,
    AuthType.USE_GEMINI,
    'fixture-explicit-key',
  );
  const environment = await createContentGeneratorConfig(
    config,
    AuthType.USE_GEMINI,
  );
  expect(explicit.apiKey).toBe('fixture-explicit-key');
  expect(environment.apiKey).toBe('fixture-env-key');
  expect(loadApiKey).not.toHaveBeenCalled();
});
