/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentWorkflow } from './agentWorkflows.js';
import {
  consumeWorkflowRequest,
  setWorkflowBudget,
  readWorkflowBudgetById,
} from './workflowBudget.js';
import { WorkflowBudgetError } from './workflowBudgetError.js';
import { I18nManager } from '../i18n/i18nManager.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-workflow-budget-handoff-'),
  );
  vi.spyOn(I18nManager.getInstance(), 't').mockImplementation((_zh, en) => en);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['boost', 'teamwork', 'grill-me'] as const)(
  'retains the paused %s budget and gives local record and recovery commands instead of a provider error',
  (mode) => {
    const task = createAgentWorkflow(
      root,
      mode,
      'Keep saved reports and approval',
      'default',
    );
    setWorkflowBudget(root, task, {
      maxRequests: 1,
      maxFailedStages: 1,
      maxImplementationRounds: 1,
    });
    consumeWorkflowRequest(root);
    let error: unknown;
    try {
      consumeWorkflowRequest(root);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(WorkflowBudgetError);
    const message = (error as Error).message;
    expect(message).toContain('Workflow blocked locally');
    expect(message).toContain(task.id);
    expect(message).toContain(
      path.join(root, 'agent-workflows', `${task.id}.json`),
    );
    expect(message).toContain(
      path.join(root, 'agent-workflows', `${task.id}.budget.json`),
    );
    expect(message).toContain(`/${mode} status ${task.id}`);
    expect(message).toContain(`/${mode} reports ${task.id}`);
    expect(readWorkflowBudgetById(root, task.id)).toMatchObject({
      state: 'paused',
      requests: 1,
    });
    const directory = path.join(root, 'agent-workflows');
    const before = Object.fromEntries(
      fs
        .readdirSync(directory)
        .map((file) => [file, fs.readFileSync(path.join(directory, file))]),
    );
    expect(() => consumeWorkflowRequest(root)).toThrow(WorkflowBudgetError);
    expect(
      Object.fromEntries(
        fs
          .readdirSync(directory)
          .map((file) => [file, fs.readFileSync(path.join(directory, file))]),
      ),
    ).toEqual(before);
  },
);

it('uses current-language local feedback for an already paused ledger without changing its reason or usage', () => {
  vi.mocked(I18nManager.getInstance().t).mockImplementation((zh) => zh);
  const task = createAgentWorkflow(
    root,
    'teamwork',
    'Preserve interruption state',
    'default',
  );
  const file = path.join(root, 'agent-workflows', `${task.id}.budget.json`);
  const budget = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...budget,
      state: 'paused',
      stopReason: 'Existing saved interruption',
    }),
  );
  const before = fs.readFileSync(file);
  expect(() => consumeWorkflowRequest(root)).toThrow('工作流已在本地受阻');
  expect(fs.readFileSync(file)).toEqual(before);
});
