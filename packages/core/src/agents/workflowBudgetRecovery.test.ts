/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createAgentWorkflow,
  cancelAgentWorkflow,
  readAgentWorkflow,
  saveAgentWorkflow,
} from './agentWorkflows.js';
import {
  activateWorkflowBudget,
  consumeWorkflowRequest,
  setWorkflowBudget,
  workflowBudget,
  workflowBudgetSummary,
} from './workflowBudget.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-budget-recovery-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  'json',
  'schema',
  'missing-counter',
  'identity',
  'oversize',
  'missing',
] as const)(
  'preserves %s ledger damage, permits explicit cancel and never grants the old task new usage',
  (damage) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Retain the task evidence',
      'default',
    );
    consumeWorkflowRequest(root);
    consumeWorkflowRequest(root);
    const file = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
    const budget = workflowBudget(root, record);
    const raw =
      damage === 'json'
        ? '{broken-budget'
        : damage === 'schema'
          ? JSON.stringify({ ...budget, requests: -1 })
          : damage === 'missing-counter'
            ? JSON.stringify({ ...budget, requests: undefined })
            : damage === 'identity'
              ? JSON.stringify({ ...budget, id: randomUUID() })
              : damage === 'oversize'
                ? 'x'.repeat(16385)
                : undefined;
    if (raw === undefined) fs.rmSync(file);
    else fs.writeFileSync(file, raw);
    expect(() => consumeWorkflowRequest(root)).toThrow();
    const cancelled = cancelAgentWorkflow(root, record.id);
    expect(cancelled).toMatchObject({
      phase: 'cancelled',
      budgetUnavailable: true,
    });
    const saved = readAgentWorkflow(root, record.id);
    expect(saved.budgetUnavailable).toBe(true);
    if (raw !== undefined)
      expect(fs.readFileSync(saved.budgetRecoveryPath!, 'utf8')).toBe(raw);
    expect(workflowBudgetSummary(root, saved)).toMatchObject({
      state: 'closed',
      accountingUnknown: true,
      requests: null,
      failedStages: null,
      implementationRounds: null,
    });
    expect(() => consumeWorkflowRequest(root)).not.toThrow();
    expect(() => activateWorkflowBudget(root, saved)).toThrow(
      'Historical workflow usage is unavailable',
    );
    expect(() =>
      setWorkflowBudget(root, saved, {
        maxRequests: 500,
        maxFailedStages: 10,
        maxImplementationRounds: 5,
      }),
    ).toThrow('Historical workflow usage is unavailable');
    // Even deleting the replacement ledger cannot convert this task into a legacy zero-use record.
    fs.rmSync(file);
    expect(() => workflowBudget(root, saved)).toThrow(
      'Tracked workflow budget is missing',
    );
    cancelAgentWorkflow(root, saved.id);
    const successor = createAgentWorkflow(
      root,
      'boost',
      'Explicit new scoped task',
      'default',
    );
    expect(successor.id).not.toBe(saved.id);
    expect(workflowBudget(root, successor)).toMatchObject({
      requests: 0,
      accountingUnknown: false,
    });
  },
);

it('preserves a broken binding and all known counters when cancelling with an intact ledger', () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Keep known usage',
    'default',
  );
  consumeWorkflowRequest(root);
  consumeWorkflowRequest(root);
  fs.writeFileSync(
    path.join(root, 'agent-workflows/current.json'),
    '{broken-binding',
  );
  expect(() => consumeWorkflowRequest(root)).toThrow('binding is damaged');
  const cancelled = cancelAgentWorkflow(root, record.id);
  const budget = workflowBudget(root, cancelled);
  expect(budget).toMatchObject({
    requests: 2,
    accountingUnknown: false,
    state: 'closed',
  });
  expect(fs.readFileSync(budget.bindingRecoveryPath!, 'utf8')).toBe(
    '{broken-binding',
  );
  expect(() => consumeWorkflowRequest(root)).not.toThrow();
  activateWorkflowBudget(root, cancelled);
  expect(workflowBudget(root, cancelled).requests).toBe(2);
});

it.each([false, true])(
  'refuses recovery with a live owner even when binding damage is %s',
  (brokenBinding) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Preserve the owning session',
      'default',
    );
    const file = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
    const pointer = path.join(root, 'agent-workflows/current.json');
    fs.writeFileSync(file, '{broken-budget');
    const pointerText = brokenBinding
      ? '{broken-binding'
      : JSON.stringify({
          id: record.id,
          ownerPid: process.pid + 10000,
        });
    if (brokenBinding) {
      record.budgetOwnerPid = process.pid + 10000;
      saveAgentWorkflow(root, record);
    }
    fs.writeFileSync(pointer, pointerText);
    vi.spyOn(process, 'kill').mockReturnValue(true);
    expect(() => cancelAgentWorkflow(root, record.id)).toThrow(
      'owning CLI session',
    );
    expect(readAgentWorkflow(root, record.id)).toMatchObject({
      phase: 'ready',
    });
    expect(
      readAgentWorkflow(root, record.id).budgetUnavailable,
    ).toBeUndefined();
    expect(fs.readFileSync(file, 'utf8')).toBe('{broken-budget');
    expect(fs.readFileSync(pointer, 'utf8')).toBe(pointerText);
  },
);
