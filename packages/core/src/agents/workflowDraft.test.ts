/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ApprovalMode } from '../policy/types.js';
import { createAgentWorkflow, readAgentWorkflow } from './agentWorkflows.js';
import { workflowBudget } from './workflowBudget.js';
import { DraftAgentWorkflowTool } from './agentWorkflowTools.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-draft-owner-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
function tool() {
  return new DraftAgentWorkflowTool(
    {
      config: {
        storage: { getProjectTempDir: () => root },
        getApprovalMode: () => ApprovalMode.PLAN,
      },
    } as unknown as AgentLoopContext,
    {} as MessageBus,
  );
}

it('refuses to overwrite another live CLI session draft and keeps its record and budget bytes', async () => {
  const record = createAgentWorkflow(
    root,
    'teamwork',
    'Original task',
    'default',
  );
  const file = path.join(root, 'agent-workflows', `${record.id}.json`);
  const ledger = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
  fs.writeFileSync(
    ledger,
    JSON.stringify({
      ...workflowBudget(root, record),
      ownerPid: process.pid + 10000,
    }),
  );
  const original = fs.readFileSync(file);
  const budget = fs.readFileSync(ledger);
  vi.spyOn(process, 'kill').mockReturnValue(true);
  await expect(
    tool()
      .build({
        workflow_id: record.id,
        brief: 'Replace original requirements',
        milestones: [
          { title: 'Replacement', acceptance: 'Replacement output' },
        ],
      })
      .execute({ abortSignal: new AbortController().signal }),
  ).rejects.toThrow('owning CLI session');
  expect(fs.readFileSync(file)).toEqual(original);
  expect(fs.readFileSync(ledger)).toEqual(budget);
});

it('saves the current owner draft without approving execution or resetting cumulative usage', async () => {
  const record = createAgentWorkflow(
    root,
    'teamwork',
    'Original task',
    'default',
  );
  const before = workflowBudget(root, record);
  const result = await tool()
    .build({
      workflow_id: record.id,
      brief: 'Keep the agreed requirements',
      milestones: [
        { title: 'Implement module', acceptance: 'Write module.mjs' },
        { title: 'Document usage', acceptance: 'Write USAGE.md' },
      ],
    })
    .execute({ abortSignal: new AbortController().signal });
  expect(readAgentWorkflow(root, record.id)).toMatchObject({
    phase: 'ready',
    approved: false,
    brief: 'Keep the agreed requirements',
  });
  expect(workflowBudget(root, record)).toEqual(before);
  expect(result.llmContent).toContain('execution has NOT been approved');
});
