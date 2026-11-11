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
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { swarmCommand } from './swarmCommand.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-command-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
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
