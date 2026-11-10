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
  latestAgentWorkflow,
  runAgentWorkflow,
} from './agentWorkflows.js';
import {
  activateWorkflowBudget,
  consumeWorkflowRequest,
  setWorkflowBudget,
  workflowBudget,
} from './workflowBudget.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-workflow-record-recovery-'),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['json', 'schema', 'identity', 'oversize', 'missing'] as const)(
  'preserves %s original records and cancels by ID while retaining independent cumulative usage',
  (damage) => {
    const record = createAgentWorkflow(
      root,
      'boost',
      'Original task evidence',
      'default',
    );
    consumeWorkflowRequest(root);
    consumeWorkflowRequest(root);
    const file = path.join(root, 'agent-workflows', `${record.id}.json`);
    const raw =
      damage === 'json'
        ? '{broken-record'
        : damage === 'schema'
          ? JSON.stringify({ ...record, milestones: 'broken' })
          : damage === 'identity'
            ? JSON.stringify({ ...record, id: randomUUID() })
            : damage === 'oversize'
              ? 'x'.repeat(8 * 1024 * 1024 + 1)
              : undefined;
    if (raw === undefined) fs.rmSync(file);
    else fs.writeFileSync(file, raw);
    const cancelled = cancelAgentWorkflow(root, record.id, 'boost');
    expect(cancelled).toMatchObject({
      phase: 'cancelled',
      recordUnavailable: true,
    });
    if (raw !== undefined)
      expect(fs.readFileSync(cancelled.recordRecoveryPath!, 'utf8')).toBe(raw);
    expect(workflowBudget(root, cancelled)).toMatchObject({
      requests: 2,
      state: 'closed',
      accountingUnknown: false,
      recordUnavailable: true,
    });
    expect(() => activateWorkflowBudget(root, cancelled)).toThrow(
      'Original workflow record is unavailable',
    );
    expect(() =>
      setWorkflowBudget(root, cancelled, {
        maxRequests: 500,
        maxFailedStages: 10,
        maxImplementationRounds: 5,
      }),
    ).toThrow('Original workflow record is unavailable');
    fs.rmSync(file);
    const again = cancelAgentWorkflow(root, record.id, 'boost');
    if (raw !== undefined)
      expect(fs.readFileSync(again.recordRecoveryPath!, 'utf8')).toBe(raw);
    expect(() => consumeWorkflowRequest(root)).not.toThrow();
    expect(
      createAgentWorkflow(root, 'teamwork', 'New scoped task', 'default').id,
    ).not.toBe(record.id);
  },
);

it('isolates damaged history from other modes but never selects an older task in place of the active damaged record', () => {
  const old = createAgentWorkflow(root, 'boost', 'Old task', 'default');
  cancelAgentWorkflow(root, old.id);
  const active = createAgentWorkflow(root, 'boost', 'Active task', 'default');
  fs.writeFileSync(
    path.join(root, 'agent-workflows', `${active.id}.json`),
    '{broken-active-record',
  );
  const warned: string[] = [];
  expect(
    latestAgentWorkflow(root, 'teamwork', (id) => warned.push(id)),
  ).toBeUndefined();
  expect(warned).toEqual([active.id]);
  expect(() => latestAgentWorkflow(root, 'boost')).toThrow(
    'older tasks were not selected',
  );
  expect(() => activateWorkflowBudget(root, old)).toThrow(
    'other pending workflow',
  );
  cancelAgentWorkflow(root, active.id, 'boost');
  expect(latestAgentWorkflow(root, 'boost')?.id).toBe(active.id);
});

it('rejects mismatched mode and live owner before moving the original record or changing its budget', () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Owning session only',
    'default',
  );
  const file = path.join(root, 'agent-workflows', `${record.id}.json`);
  fs.writeFileSync(file, '{broken-owned-record');
  expect(() => cancelAgentWorkflow(root, record.id, 'teamwork')).toThrow(
    'belongs to /boost',
  );
  const ledger = path.join(root, 'agent-workflows', `${record.id}.budget.json`);
  const budget = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  const original = JSON.stringify({ ...budget, ownerPid: process.pid + 10000 });
  fs.writeFileSync(ledger, original);
  vi.spyOn(process, 'kill').mockReturnValue(true);
  expect(() => cancelAgentWorkflow(root, record.id, 'boost')).toThrow(
    'owning CLI session',
  );
  expect(fs.readFileSync(file, 'utf8')).toBe('{broken-owned-record');
  expect(fs.readFileSync(ledger, 'utf8')).toBe(original);
  expect(
    fs
      .readdirSync(path.dirname(file))
      .some((name) => name.includes('.corrupt-')),
  ).toBe(false);
});

it('retains a record damaged during native investigation until all readers settle and local cancellation recovers it', async () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Retain the live disk failure',
    'default',
  );
  const file = path.join(root, 'agent-workflows', `${record.id}.json`);
  let settled = 0;
  let started = 0;
  let bothStarted: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  await expect(
    runAgentWorkflow(
      root,
      record.id,
      new AbortController().signal,
      async (agent) => {
        expect(agent).toBe('researcher');
        started++;
        if (started === 2) bothStarted();
        await ready;
        fs.writeFileSync(file, '{broken-during-investigation');
        settled++;
        return { completed: true, text: 'Read-only evidence.' };
      },
    ),
  ).rejects.toThrow('record');
  expect(settled).toBe(2);
  expect(fs.readFileSync(file, 'utf8')).toBe('{broken-during-investigation');
  const cancelled = cancelAgentWorkflow(root, record.id, 'boost');
  expect(fs.readFileSync(cancelled.recordRecoveryPath!, 'utf8')).toBe(
    '{broken-during-investigation',
  );
});
