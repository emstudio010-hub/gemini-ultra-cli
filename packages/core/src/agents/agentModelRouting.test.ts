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
import { handleFallback } from '../fallback/handler.js';
import { UniversalContentGenerator } from '../providers/universalContentGenerator.js';
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
