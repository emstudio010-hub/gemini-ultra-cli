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
  ApprovalMode,
  latestAgentWorkflow,
  saveAgentWorkflow,
  workflowBudget,
  consumeWorkflowRequest,
  type Config,
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  boostCommand,
  teamworkCommand,
  grillMeCommand,
} from './agentWorkflowCommands.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-command-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
function commandContext() {
  let approval = ApprovalMode.DEFAULT;
  const config = {
    storage: { getProjectTempDir: () => root },
    getApprovalMode: () => approval,
    setApprovalMode: vi.fn((mode: ApprovalMode) => {
      approval = mode;
    }),
  } as unknown as Config;
  const context = createMockCommandContext({
    services: { agentContext: { config } },
  });
  return { config, context };
}

it('keeps teamwork scoping read-only and only submits native execution after approving a draft', async () => {
  const { config, context } = commandContext();
  const prompt = await teamworkCommand.action!(
    context,
    'Deliver the requested feature',
  );
  expect(prompt).toMatchObject({ type: 'submit_prompt' });
  expect(config.getApprovalMode()).toBe(ApprovalMode.PLAN);
  const approve = teamworkCommand.subCommands!.find(
    (item) => item.name === 'approve',
  )!;
  expect(await approve.action!(context, '')).toBeUndefined();
  const record = latestAgentWorkflow(root, 'teamwork')!;
  expect(record.approved).toBe(false);
  record.phase = 'ready';
  saveAgentWorkflow(root, record);
  const execution = await approve.action!(context, '');
  expect(execution).toMatchObject({
    type: 'submit_prompt',
    content: expect.stringContaining('run_agent_workflow'),
  });
  expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
  expect(latestAgentWorkflow(root, 'teamwork')?.approved).toBe(true);
});

it('restores permissions when cancelling an interview and routes boost directly to native execution', async () => {
  const { config, context } = commandContext();
  await grillMeCommand.action!(context, 'Clarify compatibility');
  expect(config.getApprovalMode()).toBe(ApprovalMode.PLAN);
  await grillMeCommand.subCommands!.find((item) => item.name === 'cancel')!
    .action!(context, '');
  expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
  expect(latestAgentWorkflow(root, 'grill-me')?.phase).toBe('cancelled');
  const prompt = await boostCommand.action!(context, 'Fix the race');
  expect(prompt).toMatchObject({
    type: 'submit_prompt',
    content: expect.stringContaining('run_agent_workflow'),
  });
  expect(latestAgentWorkflow(root, 'boost')?.approved).toBe(true);
});

it('updates only local cumulative limits and refuses a depleted resume without submitting another prompt', async () => {
  const { context } = commandContext();
  await boostCommand.action!(context, 'Deliver a bounded fix');
  const record = latestAgentWorkflow(root, 'boost')!;
  consumeWorkflowRequest(root);
  const budget = boostCommand.subCommands!.find(
    (command) => command.name === 'budget',
  )!;
  expect(await budget.action!(context, '1 4 2')).toBeUndefined();
  expect(workflowBudget(root, record)).toMatchObject({
    requests: 1,
    maxRequests: 1,
  });
  const resume = boostCommand.subCommands!.find(
    (command) => command.name === 'resume',
  )!;
  expect(await resume.action!(context, '')).toBeUndefined();
  expect(workflowBudget(root, record).state).toBe('paused');
  expect(await budget.action!(context, '3 4 2')).toBeUndefined();
  expect(await resume.action!(context, '')).toMatchObject({
    type: 'submit_prompt',
  });
  expect(workflowBudget(root, record)).toMatchObject({
    state: 'active',
    requests: 1,
    maxRequests: 3,
  });
  expect(await budget.action!(context, '0 bad -1')).toBeUndefined();
  expect(workflowBudget(root, record).maxRequests).toBe(3);
});

it('cancels an explicitly identified damaged record locally before attempting latest lookup', async () => {
  const { context } = commandContext();
  await boostCommand.action!(context, 'Keep the original requirements');
  const record = latestAgentWorkflow(root, 'boost')!;
  fs.writeFileSync(
    path.join(root, 'agent-workflows', `${record.id}.json`),
    '{broken-original-record',
  );
  const cancel = boostCommand.subCommands!.find(
    (command) => command.name === 'cancel',
  )!;
  expect(await cancel.action!(context, record.id)).toBeUndefined();
  const cancelled = latestAgentWorkflow(root, 'boost')!;
  expect(cancelled).toMatchObject({
    id: record.id,
    phase: 'cancelled',
    recordUnavailable: true,
  });
  expect(fs.readFileSync(cancelled.recordRecoveryPath!, 'utf8')).toBe(
    '{broken-original-record',
  );
  expect(cancel.autoExecute).toBe(false);
});
