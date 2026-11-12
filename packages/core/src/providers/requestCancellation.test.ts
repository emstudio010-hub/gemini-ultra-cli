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
import { createAgentWorkflow } from '../agents/agentWorkflows.js';
import { createSwarm } from '../agents/swarm.js';
import { withAgentModel } from '../agents/agentModelRouting.js';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-pre-cancelled-request-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(
  (['workflow', 'swarm'] as const).flatMap((budget) =>
    (['native', 'external'] as const).flatMap((route) =>
      [false, true].map((stream) => ({ budget, route, stream })),
    ),
  ),
)(
  'preserves $budget dispatch budget for a pre-cancelled $route request (stream=$stream)',
  async ({ budget, route, stream }) => {
    ProviderManager.getInstance().upsertProvider({
      name: 'Cancellation fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
      models: ['external-model'],
    });
    const providersFile = path.join(root, 'providers.json');
    const providersBefore = fs.readFileSync(providersFile);
    const budgetFile =
      budget === 'workflow'
        ? path.join(
            root,
            'agent-workflows',
            `${createAgentWorkflow(root, 'boost', 'Respect cancellation before dispatch', 'default').id}.budget.json`,
          )
        : path.join(
            root,
            'swarms',
            createSwarm(root, 'Respect cancellation before dispatch').id,
            'members.json',
          );
    const budgetBefore = fs.readFileSync(budgetFile);
    const fallback: ContentGenerator = {
      generateContent: vi.fn().mockResolvedValue(new GenerateContentResponse()),
      generateContentStream: vi.fn().mockResolvedValue(
        (async function* () {
          yield new GenerateContentResponse();
        })(),
      ),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn());
    const generator = new UniversalContentGenerator(fallback, {
      storage: { getProjectTempDir: () => root },
    } as unknown as Config);
    const reason = new DOMException('Cancelled before dispatch', 'AbortError');
    const request = {
      model: route === 'native' ? 'gemini-fixture' : 'external-model',
      contents: 'No dispatch should be reserved',
      config: { abortSignal: AbortSignal.abort(reason) },
    };
    let caught: unknown;
    let observed: string[] = [];
    try {
      await withAgentModel(
        route === 'native' ? 'native:gemini-fixture' : undefined,
        async (): Promise<unknown> =>
          stream
            ? generator.generateContentStream(
                request,
                'fixture',
                LlmRole.SUBAGENT,
              )
            : generator.generateContent(request, 'fixture', LlmRole.SUBAGENT),
        (models) => {
          observed = models;
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(fs.readFileSync(budgetFile).equals(budgetBefore)).toBe(true);
    expect(caught).toBe(reason);
    expect(observed).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(fallback.generateContentStream).not.toHaveBeenCalled();
    expect(fs.readFileSync(providersFile).equals(providersBefore)).toBe(true);
  },
);
