/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { RecordingContentGenerator } from '../core/recordingContentGenerator.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';
import type { Config } from '../config/config.js';
import { tokenLimit, DEFAULT_TOKEN_LIMIT } from '../core/tokenLimits.js';
import { ProviderRouteError } from './providerRouteError.js';
import { LlmRole } from '../telemetry/llmRole.js';

describe('provider context window', () => {
  let directory: string;
  let manager: ProviderManager;
  const profile = {
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: '',
    models: ['small-model'],
  };
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'ultra-context-'));
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(directory, 'providers.json'),
    );
    ProviderManager.resetInstance();
    manager = ProviderManager.getInstance();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    ProviderManager.resetInstance();
    rmSync(directory, { recursive: true, force: true });
  });

  it('persists capacity, preserves omitted edits and explicitly clears it', () => {
    const provider = manager.upsertProvider({
      ...profile,
      contextWindow: 128000,
    });
    const reload = () =>
      new ProviderManager(path.join(directory, 'providers.json'));
    expect(reload().getActiveProvider()?.contextWindow).toBe(128000);
    manager.upsertProvider({ ...profile, id: provider.id, apiKey: 'changed' });
    expect(reload().getActiveProvider()?.contextWindow).toBe(128000);
    manager.upsertProvider({
      ...profile,
      id: provider.id,
      contextWindow: undefined,
    });
    expect(reload().getActiveProvider()?.contextWindow).toBeUndefined();
  });

  it('rejects invalid capacities without changing memory or disk', () => {
    manager.upsertProvider({ ...profile, contextWindow: 128000 });
    const before = readFileSync(path.join(directory, 'providers.json'), 'utf8');
    for (const contextWindow of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        manager.upsertProvider({ ...profile, contextWindow }),
      ).toThrow();
      expect(manager.getActiveProvider()?.contextWindow).toBe(128000);
      expect(readFileSync(path.join(directory, 'providers.json'), 'utf8')).toBe(
        before,
      );
    }
  });

  it('uses the actual route through logging and recording wrappers and live edits', () => {
    const provider = manager.upsertProvider({
      ...profile,
      contextWindow: 128000,
    });
    manager.upsertProvider({
      ...profile,
      name: 'Other',
      models: ['other-model'],
      contextWindow: 64000,
      setActive: false,
    });
    const fallback: ContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    const universal = new UniversalContentGenerator(fallback);
    const logging = new LoggingContentGenerator(universal, {} as Config);
    const recording = new RecordingContentGenerator(
      logging,
      path.join(directory, 'recording.jsonl'),
    );
    expect(tokenLimit('small-model', recording)).toBe(128000);
    expect(tokenLimit('other:other-model', recording)).toBe(64000);
    expect(tokenLimit('gemini-default', recording)).toBe(128000);
    expect(tokenLimit('unrouted-model', recording)).toBe(DEFAULT_TOKEN_LIMIT);
    manager.upsertProvider({
      ...profile,
      id: provider.id,
      contextWindow: 96000,
    });
    expect(tokenLimit('small-model', recording)).toBe(96000);
    manager.upsertProvider({
      ...profile,
      id: provider.id,
      contextWindow: undefined,
    });
    expect(tokenLimit('small-model', recording)).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('keeps optional capacity lookup usable after deletion while refusing generation before fallback or network', async () => {
    const provider = manager.upsertProvider({
      ...profile,
      contextWindow: 128000,
    });
    const fallback: ContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
      getModelContextWindow: vi.fn(() => 64000),
    };
    const universal = new UniversalContentGenerator(fallback);
    const model = `${provider.id}:small-model`;
    expect(universal.getModelContextWindow(model)).toBe(128000);
    manager.removeProviderById(provider.id);
    const saved = readFileSync(path.join(directory, 'providers.json'));
    expect(universal.getModelContextWindow(model)).toBeUndefined();
    expect(tokenLimit(model, universal)).toBe(DEFAULT_TOKEN_LIMIT);
    expect(fallback.getModelContextWindow).not.toHaveBeenCalled();
    await expect(
      universal.generateContent(
        { model, contents: [] },
        'deleted-route',
        LlmRole.MAIN,
      ),
    ).rejects.toBeInstanceOf(ProviderRouteError);
    await expect(
      universal.generateContentStream(
        { model, contents: [] },
        'deleted-route-stream',
        LlmRole.MAIN,
      ),
    ).rejects.toBeInstanceOf(ProviderRouteError);
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(fallback.generateContentStream).not.toHaveBeenCalled();
    expect(readFileSync(path.join(directory, 'providers.json'))).toEqual(saved);
  });
});
