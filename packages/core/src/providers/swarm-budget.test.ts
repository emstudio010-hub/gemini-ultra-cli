/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { isRetryableError } from '../utils/retry.js';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  setSwarmBudget,
} from '../agents/swarm.js';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-budget-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const fallback = (): ContentGenerator => ({
  generateContent: vi.fn().mockResolvedValue(new GenerateContentResponse()),
  generateContentStream: vi.fn().mockResolvedValue(
    (async function* () {
      yield new GenerateContentResponse();
    })(),
  ),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
});

it.each([
  { protocol: 'openai-chat' as const, stream: false },
  { protocol: 'openai-chat' as const, stream: true },
  { protocol: 'openai-responses' as const, stream: true },
  { protocol: 'anthropic' as const, stream: true },
  { protocol: 'gemini' as const, stream: false },
  { protocol: 'gemini' as const, stream: true },
])(
  'blocks a second actual adapter attempt before fetch: $protocol / stream=$stream',
  async ({ protocol, stream }) => {
    ProviderManager.getInstance().upsertProvider({
      name: 'Budget fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
      protocol,
      models: ['budget-fixture'],
      defaultModel: 'budget-fixture',
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('fixture service unavailable', { status: 503 }),
      );
    vi.stubGlobal('fetch', fetch);
    const generator = new UniversalContentGenerator(fallback());
    const swarm = createSwarm(root, 'No repeated paid calls');
    setSwarmBudget(root, swarm.id, {
      maxRequests: 1,
      maxFailedTurns: 2,
      maxTurns: 10,
    });
    let budgetError: unknown;
    const engine = getSwarmEngine(root, swarm.id, async () => {
      const invoke = async () => {
        const request = { model: 'budget-fixture', contents: 'Read once' };
        if (stream) {
          const chunks = await generator.generateContentStream(
            request,
            'fixture',
            LlmRole.SUBAGENT,
          );
          for await (const chunk of chunks) void chunk;
        } else {
          await generator.generateContent(request, 'fixture', LlmRole.SUBAGENT);
        }
      };
      await expect(invoke()).rejects.toThrow('503');
      try {
        await invoke();
      } catch (error) {
        budgetError = error;
      }
      return { completed: false, text: String(budgetError) };
    });
    engine.add('author', 'researcher', 'Read a source');
    await engine.wait(new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(budgetError)).toContain('model dispatch budget exhausted');
    expect(isRetryableError(budgetError)).toBe(false);
    expect(readSwarm(root, swarm.id)).toMatchObject({
      phase: 'blocked',
      budget: { requests: 1 },
    });
  },
);

it('shares the main streaming and nonstreaming fallback budget and permits normal calls after cancel', async () => {
  const swarm = createSwarm(root, 'Bound the coordinator too');
  setSwarmBudget(root, swarm.id, {
    maxRequests: 2,
    maxFailedTurns: 2,
    maxTurns: 10,
  });
  const underlying = fallback();
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const generator = new UniversalContentGenerator(underlying, config);
  const request = { model: 'gemini-budget-fixture', contents: 'Read once' };
  await generator.generateContent(request, 'main', LlmRole.MAIN);
  await generator.generateContentStream(
    request,
    'utility',
    LlmRole.UTILITY_COMPRESSOR,
  );
  await expect(
    generator.generateContent(request, 'main-again', LlmRole.MAIN),
  ).rejects.toThrow('budget exhausted');
  expect(underlying.generateContent).toHaveBeenCalledTimes(1);
  expect(underlying.generateContentStream).toHaveBeenCalledTimes(1);
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: false,
    text: 'unused',
  }));
  engine.cancel();
  await generator.generateContent(request, 'normal', LlmRole.MAIN);
  expect(underlying.generateContent).toHaveBeenCalledTimes(2);
  expect(readSwarm(root, swarm.id).budget.requests).toBe(2);
});
