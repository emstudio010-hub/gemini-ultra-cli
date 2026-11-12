/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ProviderManager, inferProtocolFromUrl } from './providerManager.js';
import { coreEvents } from '../utils/events.js';

describe('ProviderManager', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-providers-${randomUUID()}.json`);
    ProviderManager.resetInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const file of [tmpFile, `${tmpFile}.bak`]) {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) fs.rmdirSync(file);
        else fs.unlinkSync(file);
      }
    }
  });

  it('initializes with default empty list and presets', () => {
    const mgr = ProviderManager.getInstance(tmpFile);
    expect(mgr.listProviders()).toEqual([]);
    expect(mgr.getPresets().length).toBeGreaterThan(0);
    expect(mgr.getReasoningEffort()).toBe('high');
  });

  it.each(['lookup', 'update', 'remove'] as const)(
    'prioritizes a stable provider ID over another display name during %s',
    (operation) => {
      const mgr = new ProviderManager(tmpFile);
      const first = mgr.upsertProvider({
        name: 'Alpha',
        baseUrl: 'https://alpha.invalid/v1',
        apiKey: 'fixture-alpha',
        models: ['alpha-model'],
      });
      const second = mgr.upsertProvider({
        name: 'Research',
        baseUrl: 'https://research.invalid/v1',
        apiKey: 'fixture-research',
        models: ['research-model'],
      });
      mgr.upsertProvider({
        ...second,
        name: 'Research Gateway',
        setActive: false,
      });
      mgr.upsertProvider({ ...first, name: 'Research', setActive: false });
      const preserved = mgr
        .listProviders()
        .find((provider) => provider.id === first.id)!;
      const before = fs.readFileSync(tmpFile);
      if (operation === 'lookup') {
        expect(mgr.getProvider(' RESEARCH ')?.id).toBe(second.id);
        expect(mgr.getActiveProvider()?.id).toBe(second.id);
        expect(mgr.getProvider('Research Gateway')?.id).toBe(second.id);
        expect(
          mgr.resolveProviderForModel('research:research-model')?.provider.id,
        ).toBe(second.id);
        expect(fs.readFileSync(tmpFile)).toEqual(before);
      } else if (operation === 'update') {
        mgr.upsertProvider({
          ...second,
          name: 'Research Gateway',
          models: ['replacement-model'],
          defaultModel: 'replacement-model',
          setActive: false,
        });
        expect(
          mgr.listProviders().find((provider) => provider.id === second.id)
            ?.defaultModel,
        ).toBe('replacement-model');
        expect(
          mgr.listProviders().find((provider) => provider.id === first.id),
        ).toEqual(preserved);
      } else {
        expect(mgr.removeProvider('research')).toBe(true);
        expect(mgr.listProviders().map((provider) => provider.id)).toEqual([
          first.id,
        ]);
        expect(mgr.listProviders()[0]).toEqual(preserved);
      }
    },
  );

  it('can upsert, resolve and switch providers', () => {
    const mgr = ProviderManager.getInstance(tmpFile);
    const p = mgr.upsertProvider({
      name: 'ZCode',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'test-key',
      models: ['glm-5.1', 'glm-5-turbo'],
      defaultModel: 'glm-5.1',
    });

    expect(p.name).toBe('ZCode');
    expect(mgr.getActiveProvider()?.id).toBe(p.id);
    expect(mgr.getActiveModel()).toBe('glm-5.1');

    // Resolve by explicit prefix
    const res1 = mgr.resolveProviderForModel('zcode:glm-5.1');
    expect(res1?.provider.name).toBe('ZCode');
    expect(res1?.modelId).toBe('glm-5.1');

    // Resolve active model directly
    const res2 = mgr.resolveProviderForModel('glm-5.1');
    expect(res2?.provider.name).toBe('ZCode');
    expect(res2?.modelId).toBe('glm-5.1');

    // Change reasoning effort
    mgr.setReasoningEffort('xhigh');
    expect(mgr.getReasoningEffort()).toBe('xhigh');
  });

  it('persists, preserves and explicitly clears the optional output limit', () => {
    const mgr = new ProviderManager(tmpFile);
    const input = {
      name: 'Budget',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
      models: ['fixture'],
    };
    const provider = mgr.upsertProvider({ ...input, maxOutputTokens: 32768 });
    expect(
      new ProviderManager(tmpFile).getProvider(provider.id)?.maxOutputTokens,
    ).toBe(32768);
    mgr.upsertProvider({ ...input, id: provider.id, models: ['changed'] });
    expect(mgr.getProvider(provider.id)?.maxOutputTokens).toBe(32768);
    mgr.upsertProvider({
      ...input,
      id: provider.id,
      maxOutputTokens: undefined,
    });
    expect(
      new ProviderManager(tmpFile).getProvider(provider.id)?.maxOutputTokens,
    ).toBeUndefined();
    expect(fs.readFileSync(tmpFile, 'utf8')).not.toContain('maxOutputTokens');
  });

  it('rejects invalid output limits without changing saved configuration', () => {
    const mgr = new ProviderManager(tmpFile);
    const input = {
      name: 'Budget',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
    };
    const provider = mgr.upsertProvider({ ...input, maxOutputTokens: 32768 });
    const original = fs.readFileSync(tmpFile, 'utf8');
    for (const limit of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        mgr.upsertProvider({
          ...input,
          id: provider.id,
          maxOutputTokens: limit,
        }),
      ).toThrow('Invalid provider configuration');
      expect(mgr.getProvider(provider.id)?.maxOutputTokens).toBe(32768);
      expect(fs.readFileSync(tmpFile, 'utf8')).toBe(original);
    }
  });

  it.each([
    '{"providers":[{"apiKey":"private-fixture"}]}',
    '{"private-fixture":',
  ])(
    'recovers invalid provider data without destroying it (%#)',
    (original) => {
      const warning = vi
        .spyOn(coreEvents, 'emitFeedback')
        .mockImplementation(() => {});
      fs.writeFileSync(tmpFile, original);
      const mgr = new ProviderManager(tmpFile);
      expect(mgr.getAllExternalModelItems()).toEqual([]);
      expect(mgr.getActiveProvider()).toBeUndefined();
      expect(fs.readFileSync(tmpFile, 'utf8')).toBe(original);
      expect(warning).toHaveBeenCalled();
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        'private-fixture',
      );
      mgr.setReasoningEffort('high');
      expect(fs.readFileSync(`${tmpFile}.bak`, 'utf8')).toBe(original);
    },
  );

  it('keeps model defaults and provider identities consistent after edits and switches', () => {
    const mgr = new ProviderManager(tmpFile);
    const first = mgr.upsertProvider({
      name: 'Alpha',
      baseUrl: 'https://alpha.test/v1',
      apiKey: 'fixture',
      models: ['old'],
      defaultModel: 'old',
      imageModels: ['old-image'],
      defaultImageModel: 'old-image',
    });
    mgr.upsertProvider({
      id: first.id,
      name: first.name,
      baseUrl: first.baseUrl,
      apiKey: first.apiKey,
      models: ['new'],
      imageModels: [],
      setActive: false,
    });
    expect(mgr.getActiveModel()).toBe('new');
    expect(mgr.getProvider(first.id)?.defaultModel).toBe('new');
    expect(mgr.getActiveImageModel().modelId).toBe('');
    const second = mgr.upsertProvider({
      name: 'Beta',
      baseUrl: 'https://beta.test/v1',
      apiKey: 'fixture',
      models: ['beta'],
      setActive: false,
    });
    mgr.setActiveSelection(second.id);
    expect(mgr.getActiveModel()).toBe('beta');
    expect(() => mgr.setActiveSelection('missing-provider')).toThrow(
      'no longer exists',
    );
    expect(mgr.getActiveModel()).toBe('beta');
    expect(() => mgr.upsertProvider({ ...first, name: 'Beta' })).toThrow(
      'already exists',
    );
    const collisionA = mgr.upsertProvider({
      name: 'A B',
      baseUrl: first.baseUrl,
      apiKey: 'a',
      setActive: false,
    });
    const collisionB = mgr.upsertProvider({
      name: 'A-B',
      baseUrl: second.baseUrl,
      apiKey: 'b',
      setActive: false,
    });
    expect(collisionA.id).not.toBe(collisionB.id);
    expect(mgr.getProvider(collisionA.id)?.apiKey).toBe('a');
    const copy = mgr.listProviders();
    copy[0].models.push('uncommitted');
    expect(mgr.getProvider(first.id)?.models).not.toContain('uncommitted');
    const imported = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    imported.activeProviderId = second.id.toUpperCase();
    fs.writeFileSync(tmpFile, JSON.stringify(imported));
    const reloaded = new ProviderManager(tmpFile);
    expect(reloaded.getActiveProvider()?.id).toBe(second.id);
    reloaded.removeProvider(second.id);
    expect(reloaded.getActiveProvider()?.id).toBe(first.id);
  });

  it('preserves in-memory and disk configuration when saving fails', () => {
    const mgr = new ProviderManager(tmpFile);
    const provider = mgr.upsertProvider({
      name: 'Original',
      baseUrl: 'https://fixture.test/v1',
      apiKey: 'fixture',
      models: ['original'],
    });
    const original = fs.readFileSync(tmpFile, 'utf8');
    fs.mkdirSync(`${tmpFile}.bak`);
    expect(() => mgr.setReasoningEffort('ultra')).toThrow();
    expect(() => mgr.setActiveSelection(undefined)).toThrow();
    expect(() => mgr.removeProvider(provider.id)).toThrow();
    expect(() =>
      mgr.upsertProvider({ ...provider, name: 'Changed' }),
    ).toThrow();
    expect(mgr.getReasoningEffort()).toBe('high');
    expect(mgr.getActiveModel()).toBe('original');
    expect(mgr.listProviders()[0].name).toBe('Original');
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(original);
  });

  it('infers model discovery authentication and does not echo private request errors', async () => {
    const mgr = new ProviderManager(tmpFile);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'fixture' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      inferProtocolFromUrl('https://gateway.test/v1/responses/?token=ignored'),
    ).toBe('openai-responses');
    const discovered = await mgr.fetchModelsFromEndpoint({
      baseUrl: 'https://gateway.test/v1/messages/',
      apiKey: 'private-fixture',
    });
    expect(discovered.models).toEqual(['fixture']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://gateway.test/v1/models');
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe(
      'private-fixture',
    );
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers['anthropic-version']).toBe(
      '2023-06-01',
    );
    fetchMock.mockRejectedValue(
      new Error('Invalid header containing private-fixture'),
    );
    const failed = await mgr.fetchModelsFromEndpoint({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'private-fixture',
    });
    expect(failed.error).not.toContain('private-fixture');
  });
});
