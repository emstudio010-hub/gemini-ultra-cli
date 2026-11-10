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
