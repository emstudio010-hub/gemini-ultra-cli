/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderManager } from './providerManager.js';

describe('ProviderManager', () => {
  const tmpFile = path.join(os.tmpdir(), `test-providers-${Date.now()}.json`);

  beforeEach(() => {
    ProviderManager.resetInstance();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {}
  });

  it('initializes with default empty list and presets', () => {
    const mgr = ProviderManager.getInstance(tmpFile);
    expect(mgr.listProviders()).toEqual([]);
    expect(mgr.getPresets().length).toBeGreaterThan(0);
    expect(mgr.getReasoningEffort()).toBe('high');
  });

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
});
