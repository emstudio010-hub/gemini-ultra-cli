/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { AgentWorkflow } from './agentWorkflows.js';
import { assertNoPendingSwarm } from './swarm.js';
import { withAgentTaskLock } from './agentTaskLock.js';
import { WorkflowBudgetError } from './workflowBudgetError.js';
import { I18nManager } from '../i18n/i18nManager.js';

const limitsSchema = z.object({
  maxRequests: z.number().int().min(1).max(10000).default(240),
  maxFailedStages: z.number().int().min(1).max(100).default(4),
  maxImplementationRounds: z.number().int().min(1).max(100).default(2),
});
const budgetSchema = limitsSchema.extend({
  id: z.string().uuid(),
  mode: z.enum(['teamwork', 'boost', 'grill-me']),
  ownerPid: z.number().int().positive(),
  state: z.enum(['active', 'paused', 'closed']).default('active'),
  requests: z.number().int().nonnegative().default(0),
  failedStages: z.number().int().nonnegative().default(0),
  implementationRounds: z
    .array(z.number().int().nonnegative())
    .max(12)
    .default([]),
  stopReason: z.string().default(''),
  accountingUnknown: z.boolean().default(false),
  recoveryPath: z.string().optional(),
  bindingRecoveryPath: z.string().optional(),
  recordUnavailable: z.boolean().default(false),
  recordRecoveryPath: z.string().optional(),
});
export type WorkflowBudget = z.infer<typeof budgetSchema>;
export type WorkflowBudgetLimits = z.infer<typeof limitsSchema>;
interface Actor {
  root: string;
  id: string;
}
const actors = new AsyncLocalStorage<Actor>();
const controllers = new Map<string, AbortController>();
class DamagedBudgetError extends Error {}
const unavailable =
  'Historical workflow usage is unavailable. The cancelled task cannot resume or receive a new budget; create a scoped successor task.';
const recordUnavailable =
  'Original workflow record is unavailable. This cancelled task cannot resume or receive a new budget; create a scoped successor task.';
export function readWorkflowBudgetById(
  root: string,
  id: string,
): WorkflowBudget {
  return read(root, id);
}
export function markWorkflowRecordUnavailable(
  root: string,
  id: string,
  recoveryPath?: string,
): WorkflowBudget {
  const budget = read(root, id);
  owns(budget);
  budget.recordUnavailable = true;
  budget.recordRecoveryPath = recoveryPath ?? budget.recordRecoveryPath;
  save(root, budget);
  return budget;
}
export function currentWorkflowBudget(
  root: string,
): WorkflowBudget | undefined {
  const pointer = binding(root);
  return pointer ? read(root, pointer.id) : undefined;
}
function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
function damaged(error: unknown): boolean {
  return error instanceof DamagedBudgetError || isMissing(error);
}
function pointerPath(root: string): string {
  return path.join(root, 'agent-workflows', 'current.json');
}
function readJson(file: string, limit: number, message: string): unknown {
  if (fs.statSync(file).size > limit) throw new DamagedBudgetError(message);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new DamagedBudgetError(message);
    throw error;
  }
}
function binding(root: string): { id: string; ownerPid?: number } | undefined {
  const file = pointerPath(root);
  if (!fs.existsSync(file)) return undefined;
  const parsed = z
    .object({
      id: z.string().uuid(),
      ownerPid: z.number().int().positive().optional(),
    })
    .safeParse(
      readJson(
        file,
        4096,
        'Workflow binding is damaged; cancel the affected workflow locally to preserve it.',
      ),
    );
  if (!parsed.success)
    throw new DamagedBudgetError(
      'Workflow binding is damaged; cancel the affected workflow locally to preserve it.',
    );
  return parsed.data;
}
function quarantine(file: string, destination: string): void {
  fs.renameSync(file, destination);
}
function checkpoint(root: string, record: AgentWorkflow): void {
  record.budgetVersion = 1;
  record.budgetOwnerPid = process.pid;
  write(path.join(root, 'agent-workflows', `${record.id}.json`), record);
}
function budgetPath(root: string, id: string): string {
  z.string().uuid().parse(id);
  return path.join(root, 'agent-workflows', `${id}.budget.json`);
}
function write(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function save(root: string, budget: WorkflowBudget): void {
  write(budgetPath(root, budget.id), budgetSchema.parse(budget));
}
function read(root: string, id: string): WorkflowBudget {
  const file = budgetPath(root, id);
  const value = readJson(
    file,
    16384,
    'Workflow budget is damaged; cancel it locally to preserve the original state.',
  );
  const parsed = budgetSchema.safeParse(value);
  const fields = [
    'maxRequests',
    'maxFailedStages',
    'maxImplementationRounds',
    'state',
    'requests',
    'failedStages',
    'implementationRounds',
  ];
  if (
    !parsed.success ||
    parsed.data.id !== id ||
    typeof value !== 'object' ||
    value === null ||
    !fields.every((field) => Object.hasOwn(value, field))
  )
    throw new DamagedBudgetError(
      'Workflow budget is damaged; cancel it locally to preserve the original state.',
    );
  return parsed.data;
}
function owns(budget: Pick<WorkflowBudget, 'ownerPid'>): void {
  if (budget.ownerPid === process.pid) return;
  try {
    process.kill(budget.ownerPid, 0);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ESRCH'
    )
      return;
    throw error;
  }
  throw new Error(
    'Resume or change this workflow from its owning CLI session.',
  );
}
export function workflowBudget(
  root: string,
  record: AgentWorkflow,
): WorkflowBudget {
  if (fs.existsSync(budgetPath(root, record.id))) {
    const budget = read(root, record.id);
    if (
      (!record.budgetVersion || !record.budgetOwnerPid) &&
      budget.ownerPid === process.pid
    )
      checkpoint(root, record);
    return budget;
  }
  if (
    record.budgetVersion ||
    record.budgetUnavailable ||
    binding(root)?.id === record.id
  )
    throw new DamagedBudgetError(
      'Tracked workflow budget is missing; cancel the task locally. Its old usage must not be reset.',
    );
  const rounds = record.milestones.map(() => 0);
  for (const report of record.reports) {
    const match = /^implement (\d+)\.(\d+)$/.exec(report.stage);
    const index = match ? Number(match[1]) - 1 : -1;
    if (report.agent === 'coder' && index >= 0 && index < rounds.length)
      rounds[index]++;
  }
  const interrupted = /^implement (\d+)\.(\d+)$/.exec(record.stage);
  if (interrupted) {
    const index = Number(interrupted[1]) - 1;
    if (index >= 0 && index < rounds.length)
      rounds[index] = Math.max(rounds[index], Number(interrupted[2]));
  }
  const budget = budgetSchema.parse({
    id: record.id,
    mode: record.mode,
    ownerPid: process.pid,
    state: ['completed', 'cancelled'].includes(record.phase)
      ? 'closed'
      : 'active',
    implementationRounds: rounds,
    failedStages: record.reports.filter(
      (report) =>
        !report.completed ||
        (report.agent === 'workflow-auditor' && !accepted(report.text)),
    ).length,
  });
  save(root, budget);
  checkpoint(root, record);
  return budget;
}
export function workflowBudgetSummary(root: string, record: AgentWorkflow) {
  return formatBudgetSummary(workflowBudget(root, record));
}
export function savedWorkflowBudgetSummary(root: string, id: string) {
  return formatBudgetSummary(readWorkflowBudgetById(root, id));
}
function formatBudgetSummary(budget: WorkflowBudget) {
  return budget.accountingUnknown
    ? {
        ...budget,
        requests: null,
        failedStages: null,
        implementationRounds: null,
      }
    : budget;
}
export function assertWorkflowBudgetOwnership(
  root: string,
  record: AgentWorkflow,
): void {
  owns(workflowBudget(root, record));
}
function accepted(text: string): boolean {
  try {
    return z
      .object({
        passed: z.literal(true),
        summary: z.string().trim().min(1),
        evidence: z.array(z.string().trim().min(1)).min(1),
      })
      .safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}
function reason(
  budget: WorkflowBudget,
  milestone?: number,
): string | undefined {
  if (budget.requests >= budget.maxRequests) return 'model dispatch';
  if (budget.failedStages >= budget.maxFailedStages) return 'failed-stage';
  if (
    milestone !== undefined &&
    (budget.implementationRounds[milestone] ?? 0) >=
      budget.maxImplementationRounds
  )
    return `milestone ${milestone + 1} implementation-round`;
  return undefined;
}
function workflowBudgetHandoff(
  root: string,
  budget: WorkflowBudget,
): WorkflowBudgetError {
  const i18n = I18nManager.getInstance();
  return new WorkflowBudgetError(
    [
      `${i18n.t('工作流已在本地受阻', 'Workflow blocked locally')}: ${budget.mode}/${budget.id}`,
      budget.stopReason ||
        i18n.t(
          '需要显式恢复此工作流。',
          'Explicit workflow resume is required.',
        ),
      `${i18n.t('保留任务记录', 'Saved task record')}: ${path.join(root, 'agent-workflows', `${budget.id}.json`)}`,
      `${i18n.t('累计预算', 'Cumulative budget')}: ${budgetPath(root, budget.id)}`,
      `${i18n.t('查看状态', 'Inspect status')}: /${budget.mode} status ${budget.id}`,
      `${i18n.t('导出已存报告', 'Export saved reports')}: /${budget.mode} reports ${budget.id}`,
    ].join('\n'),
  );
}
function stop(root: string, budget: WorkflowBudget, limit: string): never {
  budget.state = 'paused';
  budget.stopReason = `Workflow ${limit} budget exhausted. Results retained. Use /${budget.mode} budget <requests> <failed-stages> <rounds-per-milestone>, then /${budget.mode} resume; or /${budget.mode} cancel.`;
  save(root, budget);
  const error = workflowBudgetHandoff(root, budget);
  controllers.get(budgetPath(root, budget.id))?.abort(error);
  throw error;
}
export function assertWorkflowBudget(
  root: string,
  id: string,
  milestone?: number,
): WorkflowBudget {
  const budget = read(root, id);
  if (budget.recordUnavailable) throw new Error(recordUnavailable);
  if (budget.accountingUnknown) throw new Error(unavailable);
  if (budget.state === 'paused') throw workflowBudgetHandoff(root, budget);
  if (budget.state !== 'active')
    throw new Error(
      budget.stopReason || 'Explicit workflow resume is required.',
    );
  const limit = reason(budget, milestone);
  if (limit) stop(root, budget, limit);
  return budget;
}
export function activateWorkflowBudget(
  root: string,
  record: AgentWorkflow,
): void {
  withAgentTaskLock(root, () => activateBudget(root, record));
}
function activateBudget(root: string, record: AgentWorkflow): void {
  assertNoPendingSwarm(root);
  const budget = workflowBudget(root, record);
  owns(budget);
  const current = currentWorkflowBudget(root);
  if (current && current.id !== record.id && current.state !== 'closed')
    throw new Error(
      'Resolve the other pending workflow before resuming this task.',
    );
  if (record.recordUnavailable || budget.recordUnavailable)
    throw new Error(recordUnavailable);
  if (record.budgetUnavailable || budget.accountingUnknown)
    throw new Error(unavailable);
  const next = record.approved
    ? record.milestones.findIndex((item) => !item.completed)
    : -1;
  const limit = reason(budget, next < 0 ? undefined : next);
  if (limit) stop(root, budget, limit);
  budget.ownerPid = process.pid;
  budget.state = 'active';
  budget.stopReason = '';
  save(root, budget);
  write(pointerPath(root), { id: record.id, ownerPid: process.pid });
  if (!record.budgetVersion || record.budgetOwnerPid !== process.pid)
    checkpoint(root, record);
}
export function hasOpenWorkflowBudget(root: string): boolean {
  const pointer = binding(root);
  return pointer ? read(root, pointer.id).state !== 'closed' : false;
}
export function setWorkflowBudget(
  root: string,
  record: AgentWorkflow,
  limits: WorkflowBudgetLimits,
): void {
  const budget = workflowBudget(root, record);
  owns(budget);
  if (record.recordUnavailable || budget.recordUnavailable)
    throw new Error(recordUnavailable);
  if (record.budgetUnavailable || budget.accountingUnknown)
    throw new Error(unavailable);
  save(root, {
    ...budget,
    ...limitsSchema.parse(limits),
    ownerPid: process.pid,
  });
}
export function closeWorkflowBudget(
  root: string,
  record: AgentWorkflow,
  recoverDamaged = false,
): void {
  let budget: WorkflowBudget;
  try {
    budget = workflowBudget(root, record);
  } catch (error) {
    if (!recoverDamaged || !damaged(error)) throw error;
    if (record.budgetOwnerPid) owns({ ownerPid: record.budgetOwnerPid });
    let pointer: ReturnType<typeof binding>;
    try {
      pointer = binding(root);
    } catch (bindingError) {
      if (!damaged(bindingError)) throw bindingError;
    }
    if (pointer?.id === record.id && pointer.ownerPid)
      owns({ ownerPid: pointer.ownerPid });
    const file = budgetPath(root, record.id);
    const recoveryPath = fs.existsSync(file)
      ? `${file}.corrupt-${randomUUID()}`
      : record.budgetRecoveryPath;
    record.budgetUnavailable = true;
    record.budgetRecoveryPath = recoveryPath;
    checkpoint(root, record); // Persist the unknown-usage marker before moving any evidence.
    if (recoveryPath && fs.existsSync(file)) quarantine(file, recoveryPath);
    budget = budgetSchema.parse({
      id: record.id,
      mode: record.mode,
      ownerPid: process.pid,
      state: 'closed',
      accountingUnknown: true,
      recoveryPath,
      stopReason: unavailable,
    });
  }
  owns(budget);
  budget.state = 'closed';
  save(root, budget);
  if (recoverDamaged) {
    let pointer: ReturnType<typeof binding>;
    try {
      pointer = binding(root);
    } catch (error) {
      if (!damaged(error)) throw error;
      const file = pointerPath(root);
      const backup = `${file}.corrupt-${randomUUID()}`;
      quarantine(file, backup);
      budget.bindingRecoveryPath = backup;
      save(root, budget);
      write(file, { id: record.id, ownerPid: process.pid });
    }
    if (pointer?.id === record.id)
      write(pointerPath(root), { id: record.id, ownerPid: process.pid });
  }
}
export function reserveWorkflowRound(
  root: string,
  id: string,
  milestone: number,
): number {
  const budget = assertWorkflowBudget(root, id, milestone);
  const round = (budget.implementationRounds[milestone] ?? 0) + 1;
  budget.implementationRounds[milestone] = round;
  save(root, budget);
  return round;
}
export function failWorkflowStage(root: string, id: string): void {
  const budget = read(root, id);
  if (budget.state !== 'active') return;
  budget.failedStages++;
  save(root, budget);
  if (budget.failedStages >= budget.maxFailedStages)
    stop(root, budget, 'failed-stage');
}
export async function withWorkflowBudget<T>(
  root: string,
  id: string,
  controller: AbortController,
  run: () => Promise<T>,
): Promise<T> {
  const key = budgetPath(root, id);
  controllers.set(key, controller);
  try {
    return await actors.run({ root, id }, run);
  } finally {
    controllers.delete(key);
  }
}
/** Shared main/member dispatch reservation. SDK-internal HTTP retries are outside this count. */
export function consumeWorkflowRequest(root: string | undefined): void {
  const actor = actors.getStore();
  const stateRoot = actor?.root ?? root;
  if (!stateRoot) return;
  let id = actor?.id;
  if (!id) {
    id = binding(stateRoot)?.id;
    if (!id) return;
  }
  const budget = read(stateRoot, id);
  if (budget.ownerPid !== process.pid) return;
  if (budget.state === 'closed') {
    if (actor)
      throw new Error('Workflow was cancelled; member calls are stopped.');
    return;
  }
  assertWorkflowBudget(stateRoot, id);
  budget.requests++;
  save(stateRoot, budget);
}
