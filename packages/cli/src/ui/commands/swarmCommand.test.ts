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
  createSwarm,
  readSwarm,
  consumeSwarmRequest,
  type Config,
  ApprovalMode,
  latestSwarm,
  cancelSavedSwarm,
  I18nManager,
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { swarmCommand } from './swarmCommand.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-command-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  I18nManager.getInstance().setLocale('en');
});

it('prepares a redteam role model locally and advertises it to the coordinator', async () => {
  const { context } = resumeContext();
  const prepare = swarmCommand.subCommands!.find(
    (command) => command.name === 'prepare',
  )!;
  const model = swarmCommand.subCommands!.find(
    (command) => command.name === 'model',
  )!;
  await prepare.action!(context, 'Review supplied local source');
  await model.action!(context, 'redteam-analyst native:gemini-review');
  expect(latestSwarm(root)?.roleModels).toMatchObject({
    'redteam-analyst': 'native:gemini-review',
  });
  const result = await resumeContext().resume.action!(context, '');
  expect(result).toMatchObject({
    type: 'submit_prompt',
    content: expect.stringContaining('redteam-analyst'),
  });
  expect(latestSwarm(root)?.budget.requests).toBe(0);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function resumeContext(approval = ApprovalMode.DEFAULT) {
  const config = {
    storage: { getProjectTempDir: () => root },
    getApprovalMode: () => approval,
    setApprovalMode: vi.fn(),
  } as unknown as Config;
  return {
    config,
    context: createMockCommandContext({
      services: { agentContext: { config } },
    }),
    resume: swarmCommand.subCommands!.find(
      (command) => command.name === 'resume',
    )!,
  };
}

function savedFiles() {
  return Object.fromEntries(
    fs.readdirSync(root, { recursive: true }).flatMap((entry) => {
      const file = path.join(root, String(entry));
      return fs.statSync(file).isFile()
        ? [[String(entry), fs.readFileSync(file)]]
        : [];
    }),
  );
}

it('resumes the specified historical swarm rather than the newer terminal task, preserving spent requests', async () => {
  const older = createSwarm(root, 'Historical selected swarm');
  consumeSwarmRequest(root);
  cancelSavedSwarm(root, older.id);
  const newer = createSwarm(root, 'Newer cancelled swarm');
  cancelSavedSwarm(root, newer.id);
  const { config, context, resume } = resumeContext();
  expect(await resume.action!(context, older.id)).toMatchObject({
    type: 'submit_prompt',
    content: expect.stringContaining(older.id),
  });
  expect(latestSwarm(root)).toMatchObject({
    id: older.id,
    budget: { requests: 1 },
  });
  expect(readSwarm(root, newer.id).phase).toBe('cancelled');
  expect(config.setApprovalMode).not.toHaveBeenCalled();
  expect(resume.autoExecute).toBe(false);
});

it.each(['en', 'zh'] as const)(
  'returns a completed historical swarm locally in %s even when its binding is damaged',
  async (locale) => {
    I18nManager.getInstance().setLocale(locale);
    const older = createSwarm(root, 'Historical completed swarm');
    const file = path.join(root, 'swarms', older.id, 'members.json');
    fs.writeFileSync(file, JSON.stringify({ ...older, phase: 'completed' }));
    fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{damaged binding');
    const { config, context, resume } = resumeContext(ApprovalMode.PLAN);
    const before = savedFiles();
    expect(await resume.action!(context, older.id)).toBeUndefined();
    expect(context.ui.addItem).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(context.ui.addItem).mock.calls)).toContain(
      older.id,
    );
    expect(JSON.stringify(vi.mocked(context.ui.addItem).mock.calls)).toContain(
      locale === 'zh' ? '不会重复执行' : 'No work will be repeated',
    );
    expect(config.setApprovalMode).not.toHaveBeenCalled();
    expect(savedFiles()).toEqual(before);
  },
);

it('keeps no-ID resume on the current swarm and refuses execution in Plan Mode without mutation', async () => {
  const swarm = createSwarm(root, 'Current swarm');
  const { context, resume } = resumeContext();
  expect(await resume.action!(context, '')).toMatchObject({
    type: 'submit_prompt',
    content: expect.stringContaining(swarm.id),
  });
  const planned = resumeContext(ApprovalMode.PLAN);
  const before = savedFiles();
  expect(
    await planned.resume.action!(planned.context, swarm.id),
  ).toBeUndefined();
  expect(savedFiles()).toEqual(before);
  expect(planned.config.setApprovalMode).not.toHaveBeenCalled();
});

it('rejects bad or missing IDs and another pending swarm without falling back or submitting a prompt', async () => {
  const older = createSwarm(root, 'Historical swarm');
  cancelSavedSwarm(root, older.id);
  createSwarm(root, 'Pending newer swarm');
  const { context, resume, config } = resumeContext();
  const before = savedFiles();
  for (const id of [
    'invalid-id',
    '0a1351a7-6140-4b23-bf68-5e88b480fa07',
    older.id,
  ]) {
    expect(await resume.action!(context, id)).toBeUndefined();
    expect(savedFiles()).toEqual(before);
  }
  expect(config.setApprovalMode).not.toHaveBeenCalled();
  expect(context.ui.addItem).toHaveBeenCalledTimes(3);
});

it('inspects a historical swarm by ID even when the latest binding is damaged, without modifying it', async () => {
  const older = createSwarm(root, 'Older historical swarm');
  cancelSavedSwarm(root, older.id);
  createSwarm(root, 'Newer current swarm');
  const binding = path.join(root, 'swarms/latest.json');
  fs.writeFileSync(binding, '{unrelated damaged binding');
  const memberFile = path.join(root, 'swarms', older.id, 'members.json');
  const before = fs.readFileSync(memberFile);
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const status = swarmCommand.subCommands!.find(
    (item) => item.name === 'status',
  )!;
  expect(await status.action!(context, older.id)).toBeUndefined();
  expect(JSON.stringify(vi.mocked(context.ui.addItem).mock.calls)).toContain(
    'Older historical swarm',
  );
  expect(
    JSON.stringify(vi.mocked(context.ui.addItem).mock.calls),
  ).not.toContain('Newer current swarm');
  expect(fs.readFileSync(memberFile)).toEqual(before);
  expect(fs.readFileSync(binding, 'utf8')).toBe('{unrelated damaged binding');
});

it('exports a saved Swarm by ID without relying on its latest binding or submitting a prompt', async () => {
  const swarm = createSwarm(root, 'Retain historical member results');
  fs.writeFileSync(
    path.join(root, 'swarms/latest.json'),
    '{unrelated damaged binding',
  );
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const reports = swarmCommand.subCommands!.find(
    (command) => command.name === 'reports',
  )!;
  const source = path.join(root, 'swarms', swarm.id, 'members.json');
  const before = fs.readFileSync(source);
  expect(await reports.action!(context, swarm.id)).toBeUndefined();
  expect(reports.autoExecute).toBe(false);
  expect(fs.readFileSync(source)).toEqual(before);
  expect(
    fs.readdirSync(path.join(root, 'agent-reports', swarm.id)),
  ).toHaveLength(1);
});

it('changes only cumulative limits locally, rejects malformed input and never submits a paid prompt', async () => {
  const swarm = createSwarm(root, 'Deliver a scoped task');
  consumeSwarmRequest(root);
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const budget = swarmCommand.subCommands!.find(
    (command) => command.name === 'budget',
  )!;
  expect(await budget.action!(context, '24 2 8')).toBeUndefined();
  expect(readSwarm(root, swarm.id).budget).toMatchObject({
    maxRequests: 24,
    maxFailedTurns: 2,
    maxTurns: 8,
    requests: 1,
  });
  expect(await budget.action!(context, '2x 0 -1')).toBeUndefined();
  expect(readSwarm(root, swarm.id).budget.maxRequests).toBe(24);
  expect(budget.autoExecute).toBe(false);
});

it('cancels by an explicit ID before reading a damaged latest binding, without a submitted prompt', async () => {
  const swarm = createSwarm(root, 'Keep the damaged state');
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{broken-binding');
  fs.writeFileSync(
    path.join(root, 'swarms', swarm.id, 'members.json'),
    '{broken-members',
  );
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const cancel = swarmCommand.subCommands!.find(
    (command) => command.name === 'cancel',
  )!;
  expect(await cancel.action!(context, swarm.id)).toBeUndefined();
  expect(readSwarm(root, swarm.id)).toMatchObject({
    phase: 'cancelled',
    accountingUnknown: true,
  });
  expect(cancel.autoExecute).toBe(false);
});

it('saves a role model locally without submitting a prompt or resetting usage', async () => {
  const swarm = createSwarm(root, 'Choose member models');
  consumeSwarmRequest(root);
  const config = {
    storage: { getProjectTempDir: () => root },
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const model = swarmCommand.subCommands!.find(
    (command) => command.name === 'model',
  )!;
  expect(
    await model.action!(context, 'researcher native:gemini-fixture'),
  ).toBeUndefined();
  expect(readSwarm(root, swarm.id)).toMatchObject({
    roleModels: { researcher: 'native:gemini-fixture' },
    budget: { requests: 1 },
  });
  expect(await model.action!(context, 'researcher inherit')).toBeUndefined();
  expect(readSwarm(root, swarm.id).roleModels.researcher).toBeUndefined();
  expect(model.autoExecute).toBe(false);
});

it('prepares a task and a future named model before any member or model call starts', async () => {
  const config = {
    storage: { getProjectTempDir: () => root },
    getApprovalMode: () => ApprovalMode.DEFAULT,
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  const prepare = swarmCommand.subCommands!.find(
    (command) => command.name === 'prepare',
  )!;
  expect(
    await prepare.action!(context, 'Prepare a multi-model task'),
  ).toBeUndefined();
  const model = swarmCommand.subCommands!.find(
    (command) => command.name === 'model',
  )!;
  expect(
    await model.action!(context, '@author native:gemini-fixture'),
  ).toBeUndefined();
  expect(latestSwarm(root)).toMatchObject({
    memberModels: { author: 'native:gemini-fixture' },
    members: [],
    budget: { requests: 0, turns: 0 },
  });
});
