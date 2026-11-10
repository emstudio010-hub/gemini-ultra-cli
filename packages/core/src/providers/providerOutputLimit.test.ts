/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GenerateContentParameters } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { ProviderManager } from './providerManager.js';
import type { ProviderProtocol } from './providerTypes.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';

describe('Provider output limit', () => {
  let directory: string;
  const fallback: ContentGenerator = {
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  };
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'ultra-output-limit-'));
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(directory, 'providers.json'),
    );
    ProviderManager.resetInstance();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    ProviderManager.resetInstance();
    rmSync(directory, { recursive: true, force: true });
  });

  const protocols: Array<{
    protocol: ProviderProtocol;
    model: string;
    field: string;
  }> = [
    { protocol: 'openai-chat', model: 'fixture', field: 'max_tokens' },
    { protocol: 'openai-chat', model: 'gpt-5', field: 'max_completion_tokens' },
    {
      protocol: 'openai-responses',
      model: 'fixture',
      field: 'max_output_tokens',
    },
    { protocol: 'anthropic', model: 'fixture', field: 'max_tokens' },
    { protocol: 'gemini', model: 'fixture', field: 'maxOutputTokens' },
  ];

  it.each(
    protocols.flatMap((entry) => [
      { ...entry, stream: false },
      { ...entry, stream: true },
    ]),
  )(
    'serializes defaults and explicit overrides: $protocol / $model / stream=$stream',
    async ({ protocol, model, field, stream }) => {
      const manager = ProviderManager.getInstance();
      const provider = manager.upsertProvider({
        name: 'Fixture',
        baseUrl: 'https://fixture.invalid/v1',
        apiKey: '',
        protocol,
        models: [model],
      });
      const generator = new UniversalContentGenerator(fallback);
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fixture transport boundary'));
      vi.stubGlobal('fetch', fetchMock);
      const invoke = async (request: GenerateContentParameters) => {
        if (stream) {
          const chunks = await generator.generateContentStream(
            request,
            'fixture',
            LlmRole.MAIN,
          );
          for await (const chunk of chunks) void chunk;
        } else {
          await generator.generateContent(request, 'fixture', LlmRole.MAIN);
        }
      };
      const captured = () => {
        const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
        return protocol === 'gemini' ? body.generationConfig : body;
      };
      const request = {
        model,
        contents: 'fixture',
        config: { temperature: 0.2 },
      };
      await expect(invoke(request)).rejects.toThrow(
        'fixture transport boundary',
      );
      expect(captured()[field]).toBe(
        protocol === 'anthropic' ? 24192 : undefined,
      );
      manager.upsertProvider({ ...provider, maxOutputTokens: 32768 });
      await expect(invoke(request)).rejects.toThrow(
        'fixture transport boundary',
      );
      expect(captured()[field]).toBe(32768);
      expect(request.config).toEqual({ temperature: 0.2 });
      await expect(
        invoke({
          ...request,
          config: { ...request.config, maxOutputTokens: 1234 },
        }),
      ).rejects.toThrow('fixture transport boundary');
      expect(captured()[field]).toBe(1234);
      if (protocol === 'openai-chat') {
        expect(
          captured()[
            field === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
          ],
        ).toBeUndefined();
        const calls = fetchMock.mock.calls.length;
        await expect(
          invoke({ ...request, config: { maxOutputTokens: 0 } }),
        ).rejects.toThrow('maxOutputTokens must be a positive integer');
        expect(fetchMock).toHaveBeenCalledTimes(calls);
      }
    },
  );
});
