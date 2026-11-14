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
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { handleFallback } from '../fallback/handler.js';
import { UniversalContentGenerator } from '../providers/universalContentGenerator.js';
import { ExternalFallbackGenerator } from '../providers/externalFallbackGenerator.js';
import { ProviderManager } from '../providers/providerManager.js';
import { LlmRole } from '../telemetry/llmRole.js';
import {
  normalizeAgentModel,
  withAgentModel,
  currentAgentModel,
  agentExecutionModel,
  availableAgentModels,
} from './agentModelRouting.js';
import {
  createAgentWorkflow,
  setWorkflowRoleModel,
  runAgentWorkflow,
} from './agentWorkflows.js';
import { workflowBudget } from './workflowBudget.js';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  setSwarmModel,
} from './swarm.js';

let root: string;
let providersFile: string;
let generator: UniversalContentGenerator;
let fallback: ContentGenerator;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-agent-model-'));
  providersFile = path.join(root, 'providers.json');
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', providersFile);
  ProviderManager.resetInstance();
  const manager = ProviderManager.getInstance();
  manager.upsertProvider({
    name: 'Primary',
    baseUrl: 'https://primary.invalid/v1',
    apiKey: 'fixture-primary',
    protocol: 'openai-chat',
    models: ['main-model'],
    defaultModel: 'main-model',
  });
  manager.upsertProvider({
    name: 'Research',
    baseUrl: 'https://research.invalid/v1',
    apiKey: 'fixture-research',
    protocol: 'openai-chat',
    models: ['research-model'],
    contextWindow: 32000,
    setActive: false,
  });
  manager.upsertProvider({
    name: 'Implementation',
    baseUrl: 'https://implementation.invalid/v1',
    apiKey: 'fixture-implementation',
    protocol: 'openai-chat',
    models: ['build-model'],
    contextWindow: 96000,
    setActive: false,
  });
  fallback = {
    generateContent: vi.fn().mockResolvedValue(new GenerateContentResponse()),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
    getModelContextWindow: vi.fn().mockReturnValue(64000),
  };
  generator = new UniversalContentGenerator(fallback);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content: 'Evidence.' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const request = () =>
  generator.generateContent(
    { model: 'main-model', contents: 'Read the source' },
    'fixture',
    LlmRole.SUBAGENT,
  );

it.each(['native-generate', 'native-stream', 'unresolved-main'] as const)(
  'rejects unsupported external-only %s locally before spending dispatch budget',
  async (operation) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Keep authentication mismatch local',
      'default',
    );
    const file = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
    const before = fs.readFileSync(file);
    const providerBefore = fs.readFileSync(providersFile);
    const routed = new UniversalContentGenerator(
      new ExternalFallbackGenerator(),
      { storage: { getProjectTempDir: () => root } } as unknown as Config,
    );
    const execute = async (): Promise<unknown> =>
      operation === 'native-stream'
        ? routed.generateContentStream(
            {
              model: 'main-model',
              contents: 'No native credentials in this session',
            },
            'fixture',
            LlmRole.SUBAGENT,
          )
        : routed.generateContent(
            {
              model:
                operation === 'unresolved-main'
                  ? 'unregistered-bare-model'
                  : 'main-model',
              contents: 'No native credentials in this session',
            },
            'fixture',
            LlmRole.MAIN,
          );
    const run = () =>
      operation === 'unresolved-main'
        ? execute()
        : withAgentModel('native:gemini-fixture', execute, () => {});
    await expect(run()).rejects.toMatchObject({
      name: 'ProviderRouteError',
      message: expect.stringContaining('/auth'),
    });
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readFileSync(providersFile)).toEqual(providerBefore);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('keeps offline token estimates available for an external-only native selection', async () => {
  const routed = new UniversalContentGenerator(new ExternalFallbackGenerator());
  const contents = 'Offline metadata does not require native authentication';
  const counted = await withAgentModel(
    'native:gemini-fixture',
    () => routed.countTokens({ model: 'main-model', contents }),
    () => {},
  );
  expect(counted.totalTokens).toBeGreaterThan(0);
  expect(Number.isInteger(counted.totalTokens)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it('counts tokens for parallel native member models through the utility client without using the parent model', async () => {
  const before = fs.readFileSync(providersFile);
  vi.mocked(fallback.countTokens).mockImplementation(async (request) => {
    await Promise.resolve();
    return {
      totalTokens:
        request.model === 'gemini-reader'
          ? 17
          : request.model === 'gemini-reviewer'
            ? 29
            : 999,
    };
  });
  const client = new BaseLlmClient(generator, {
    getActiveModel: () => 'main-model',
    modelConfigService: {
      getResolvedConfig: () => ({ model: 'parent-calibrator' }),
    },
  } as unknown as Config);
  const controller = new AbortController();
  const contents = [{ role: 'user', parts: [{ text: 'Same saved context' }] }];
  const original = JSON.stringify(contents);
  const [reader, reviewer] = await Promise.all([
    withAgentModel(
      'native:gemini-reader',
      () => client.countTokens({ contents, abortSignal: controller.signal }),
      () => {},
    ),
    withAgentModel(
      'native:gemini-reviewer',
      () =>
        client.countTokens({
          modelConfigKey: { model: 'context-calibrator' },
          contents,
          abortSignal: controller.signal,
        }),
      () => {},
    ),
  ]);
  expect([reader.totalTokens, reviewer.totalTokens]).toEqual([17, 29]);
  expect(
    vi
      .mocked(fallback.countTokens)
      .mock.calls.map(([request]) => request.model),
  ).toEqual(['gemini-reader', 'gemini-reviewer']);
  for (const [request] of vi.mocked(fallback.countTokens).mock.calls)
    expect(request.config?.abortSignal).toBe(controller.signal);
  expect(JSON.stringify(contents)).toBe(original);
  expect(fs.readFileSync(providersFile)).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
  expect(currentAgentModel()).toBeUndefined();
});

it('retains local token estimation when the selected native token counter fails', async () => {
  vi.mocked(fallback.countTokens).mockRejectedValue(
    new Error('Fixture native token endpoint unavailable'),
  );
  const request = {
    model: 'main-model',
    contents: 'Preserve local estimation fallback',
  };
  const result = await withAgentModel(
    'native:gemini-reader',
    () => generator.countTokens(request),
    () => {},
  );
  expect(result.totalTokens).toBe(
    Math.ceil(JSON.stringify(request.contents).length / 3),
  );
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['generate', 'stream', 'tokens', 'capacity'] as const)(
  'keeps an unavailable main provider prefix local during %s without dispatch or spending the saved budget',
  async (operation) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Keep invalid main routes local',
      'default',
    );
    const file = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
    const before = fs.readFileSync(file);
    const providerBefore = fs.readFileSync(providersFile);
    const routed = new UniversalContentGenerator(fallback, {
      storage: { getProjectTempDir: () => root },
    } as unknown as Config);
    const request = {
      model: 'missing-provider:fixture-model',
      contents: 'Keep this request local',
    };
    const run = async (): Promise<unknown> =>
      operation === 'generate'
        ? routed.generateContent(request, 'fixture', LlmRole.MAIN)
        : operation === 'stream'
          ? routed.generateContentStream(request, 'fixture', LlmRole.MAIN)
          : operation === 'tokens'
            ? routed.countTokens(request)
            : routed.getModelContextWindow(request.model);
    if (operation === 'capacity') {
      // Optional UI metadata remains readable while the user repairs the route.
      await expect(run()).resolves.toBeUndefined();
    } else {
      await expect(run()).rejects.toMatchObject({
        name: 'ProviderRouteError',
        message: expect.stringContaining('/provider list'),
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(fallback.generateContentStream).not.toHaveBeenCalled();
    expect(fallback.countTokens).not.toHaveBeenCalled();
    expect(fallback.getModelContextWindow).not.toHaveBeenCalled();
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readFileSync(providersFile)).toEqual(providerBefore);
  },
);

it('still dispatches a configured bare model containing a colon through its registered provider', async () => {
  const manager = ProviderManager.getInstance();
  manager.upsertProvider({
    ...manager.getProvider('primary')!,
    models: ['main-model', 'local-model:latest'],
  });
  await generator.generateContent(
    { model: 'local-model:latest', contents: 'Registered bare model' },
    'fixture',
    LlmRole.MAIN,
  );
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
    'https://primary.invalid/v1/chat/completions',
  );
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).model,
  ).toBe('local-model:latest');
  expect(fallback.generateContent).not.toHaveBeenCalled();
});

it('keeps a saved member provider ID on its configured endpoint after another provider takes that display name', async () => {
  const manager = ProviderManager.getInstance();
  const primary = manager.getProvider('primary')!;
  const research = manager.getProvider('research')!;
  manager.upsertProvider({
    ...research,
    name: 'Research Gateway',
    setActive: false,
  });
  manager.upsertProvider({ ...primary, name: 'Research', setActive: false });
  const before = fs.readFileSync(providersFile);
  expect(normalizeAgentModel('research:research-model')).toBe(
    'research:research-model',
  );
  await withAgentModel('research:research-model', request, (used) =>
    expect(used).toEqual(['research:research-model']),
  );
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
    'https://research.invalid/v1/chat/completions',
  );
  expect(fallback.generateContent).not.toHaveBeenCalled();
  expect(fs.readFileSync(providersFile)).toEqual(before);
  expect(manager.getActiveProvider()?.id).toBe(primary.id);
});

it.each(['before-scope', 'during-scope'] as const)(
  'refuses a deleted member route %s instead of dispatching to its display-name alias',
  async (timing) => {
    const manager = ProviderManager.getInstance();
    const primary = manager.getProvider('primary')!;
    const research = manager.getProvider('research')!;
    manager.upsertProvider({
      ...research,
      name: 'Research Gateway',
      setActive: false,
    });
    manager.upsertProvider({ ...primary, name: 'Research', setActive: false });
    let afterDeletion: Buffer | undefined;
    if (timing === 'before-scope') {
      manager.removeProvider(research.id);
      afterDeletion = fs.readFileSync(providersFile);
    }
    await expect(
      withAgentModel(
        'research:research-model',
        async () => {
          if (timing === 'during-scope') {
            manager.removeProvider(research.id);
            afterDeletion = fs.readFileSync(providersFile);
          }
          return request();
        },
        () => {},
      ),
    ).rejects.toThrow('provider is unavailable');
    expect(fetch).not.toHaveBeenCalled();
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(afterDeletion).toBeDefined();
    expect(fs.readFileSync(providersFile)).toEqual(afterDeletion);
    expect(manager.getActiveProvider()?.id).toBe(primary.id);
    expect(manager.getProvider('Research')?.id).toBe(primary.id);
  },
);

it.each(['generate', 'stream', 'tokens', 'capacity'] as const)(
  'keeps a removed scoped provider local during %s without breaking optional metadata or spending budget',
  async (operation) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Preserve removed routes',
      'default',
    );
    const budgetFile = path.join(
      root,
      'agent-workflows',
      `${record.id}.budget.json`,
    );
    const budgetBefore = fs.readFileSync(budgetFile);
    const routed = new UniversalContentGenerator(fallback, {
      storage: { getProjectTempDir: () => root },
    } as unknown as Config);
    const used: string[][] = [];
    await withAgentModel(
      'research:research-model',
      async () => {
        ProviderManager.getInstance().removeProviderById('research');
        const providerBefore = fs.readFileSync(providersFile);
        const input = {
          model: 'main-model',
          contents: 'Keep this request local',
        };
        const run = async (): Promise<unknown> =>
          operation === 'generate'
            ? routed.generateContent(input, 'fixture', LlmRole.SUBAGENT)
            : operation === 'stream'
              ? routed.generateContentStream(input, 'fixture', LlmRole.SUBAGENT)
              : operation === 'tokens'
                ? routed.countTokens(input)
                : routed.getModelContextWindow(input.model);
        if (operation === 'capacity')
          await expect(run()).resolves.toBeUndefined();
        else
          await expect(run()).rejects.toMatchObject({
            name: 'ProviderRouteError',
            message: expect.stringContaining('provider is unavailable'),
          });
        expect(fs.readFileSync(providersFile)).toEqual(providerBefore);
      },
      (models) => used.push(models),
    );
    expect(used).toEqual([[]]);
    expect(currentAgentModel()).toBeUndefined();
    expect(fs.readFileSync(budgetFile)).toEqual(budgetBefore);
    expect(fetch).not.toHaveBeenCalled();
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(fallback.generateContentStream).not.toHaveBeenCalled();
    expect(fallback.countTokens).not.toHaveBeenCalled();
    expect(fallback.getModelContextWindow).not.toHaveBeenCalled();
  },
);

it('isolates parallel member routes and capacity lookup without changing the provider file or main route', async () => {
  const original = fs.readFileSync(providersFile, 'utf8');
  const used: string[][] = [];
  const capacities = await Promise.all([
    withAgentModel(
      'research:research-model',
      async () => {
        await Promise.resolve();
        expect(agentExecutionModel('auto')).toBe('research:research-model');
        await request();
        return generator.getModelContextWindow('main-model');
      },
      (models) => used.push(models),
    ),
    withAgentModel(
      'implementation:build-model',
      async () => {
        await Promise.resolve();
        await request();
        return generator.getModelContextWindow('main-model');
      },
      (models) => used.push(models),
    ),
  ]);
  expect(capacities).toEqual([32000, 96000]);
  expect(currentAgentModel()).toBeUndefined();
  await request();
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.map(([url]) => String(url))).toEqual([
    'https://research.invalid/v1/chat/completions',
    'https://implementation.invalid/v1/chat/completions',
    'https://primary.invalid/v1/chat/completions',
  ]);
  expect(
    calls.map(([, options]) => JSON.parse(String(options!.body)).model),
  ).toEqual(['research-model', 'build-model', 'main-model']);
  expect(used.flat().sort()).toEqual([
    'implementation:build-model',
    'research:research-model',
  ]);
  expect(fs.readFileSync(providersFile, 'utf8')).toBe(original);
  expect(
    availableAgentModels().every(
      (item) => !item.includes('https:') && !item.includes('fixture-'),
    ),
  ).toBe(true);
});

it('selects native fallback explicitly and fails a missing external provider before dispatch instead of changing route', async () => {
  await withAgentModel(
    'native:gemini-fixture',
    async () => {
      expect(agentExecutionModel('main-model')).toBe('gemini-fixture');
      expect(generator.getModelContextWindow('main-model')).toBe(64000);
      await request();
    },
    (used) => expect(used).toEqual(['native:gemini-fixture']),
  );
  expect(fallback.generateContent).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'gemini-fixture' }),
    'fixture',
    LlmRole.SUBAGENT,
  );
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    withAgentModel(
      'research:research-model',
      async () => {
        ProviderManager.getInstance().removeProvider('research');
        return request();
      },
      () => {},
    ),
  ).rejects.toThrow('provider is unavailable');
  expect(fetch).not.toHaveBeenCalled();
  expect(() => normalizeAgentModel('missing:model')).toThrow(
    'provider is unavailable',
  );
  expect(normalizeAgentModel('inherit')).toBeUndefined();
  ProviderManager.getInstance().upsertProvider({
    name: '中文供应商',
    baseUrl: 'https://chinese.invalid/v1',
    apiKey: '',
    protocol: 'openai-chat',
    models: ['模型-1'],
    setActive: false,
  });
  expect(normalizeAgentModel('中文供应商:模型-1')).toBe('中文供应商:模型-1');
});

it('keeps an explicitly routed member failure from mutating parent fallback policy or showing a model-switch prompt', async () => {
  const config = {
    getActiveModel: vi.fn(() => {
      throw new Error('Parent policy must remain untouched');
    }),
  } as unknown as Config;
  await withAgentModel(
    'research:research-model',
    async () => {
      expect(
        await handleFallback(config, 'research:research-model', undefined, {
          status: 429,
        }),
      ).toBeNull();
    },
    () => {},
  );
  expect(config.getActiveModel).not.toHaveBeenCalled();
});

it('persists workflow role selection and actual dispatched routes while all calls share the existing task budget', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Deliver a multi-model result',
    'default',
  );
  setWorkflowRoleModel(
    root,
    record.id,
    'researcher',
    'research:research-model',
  );
  setWorkflowRoleModel(root, record.id, 'coder', 'implementation:build-model');
  setWorkflowRoleModel(
    root,
    record.id,
    'workflow-auditor',
    'research:research-model',
  );
  const finished = await runAgentWorkflow(
    root,
    record.id,
    new AbortController().signal,
    async (agent) => {
      await request();
      return {
        completed: true,
        text:
          agent === 'workflow-auditor'
            ? JSON.stringify({
                passed: true,
                summary: 'Inspected the artifact.',
                evidence: ['artifact.txt'],
              })
            : 'Evidence retained.',
      };
    },
  );
  expect(finished.phase).toBe('completed');
  expect(finished.reports.map((report) => report.modelsUsed)).toEqual([
    ['research:research-model'],
    ['research:research-model'],
    ['implementation:build-model'],
    ['research:research-model'],
    ['research:research-model'],
  ]);
  expect(workflowBudget(root, finished).requests).toBe(5);
  expect(ProviderManager.getInstance().getActiveModel()).toBe('main-model');
});

it('lets an idle named member override a role on its next wake and refuses edits during a running turn', async () => {
  const swarm = createSwarm(root, 'Investigate two paths');
  setSwarmModel(root, swarm.id, 'researcher', 'research:research-model');
  setSwarmModel(root, swarm.id, '@alpha', 'implementation:build-model');
  const engine = getSwarmEngine(root, swarm.id, async () => {
    await request();
    return { completed: true, text: 'Read-only report.' };
  });
  engine.add('alpha', 'researcher', 'Read the first source');
  engine.add('beta', 'researcher', 'Read the second source');
  expect(() =>
    setSwarmModel(root, swarm.id, '@beta', 'implementation:build-model'),
  ).toThrow('finish before');
  await engine.wait(new AbortController().signal);
  setSwarmModel(root, swarm.id, '@beta', 'implementation:build-model');
  engine.post('coordinator', '@beta inspect new evidence');
  await engine.wait(new AbortController().signal);
  const saved = readSwarm(root, swarm.id);
  expect(
    saved.members.find((member) => member.name === 'alpha')?.modelsUsed,
  ).toEqual(['implementation:build-model']);
  expect(
    saved.members.find((member) => member.name === 'beta')?.modelsUsed,
  ).toEqual(['implementation:build-model']);
  expect(saved.budget.requests).toBe(3);
});
