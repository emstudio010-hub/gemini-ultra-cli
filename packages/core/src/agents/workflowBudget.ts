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
});
export type WorkflowBudget = z.infer<typeof budgetSchema>;
export type WorkflowBudgetLimits = z.infer<typeof limitsSchema>;
interface Actor {
  root: string;
  id: string;
}
const actors = new AsyncLocalStorage<Actor>();
const controllers = new Map<string, AbortController>();
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
  if (fs.statSync(file).size > 16384)
    throw new Error('Workflow budget is too large.');
  return budgetSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function owns(budget: WorkflowBudget): void {
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
  if (fs.existsSync(budgetPath(root, record.id))) return read(root, record.id);
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
  return budget;
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
function stop(root: string, budget: WorkflowBudget, limit: string): never {
  budget.state = 'paused';
  budget.stopReason = `Workflow ${limit} budget exhausted. Results retained. Use /${budget.mode} budget <requests> <failed-stages> <rounds-per-milestone>, then /${budget.mode} resume; or /${budget.mode} cancel.`;
  save(root, budget);
  controllers
    .get(budgetPath(root, budget.id))
    ?.abort(new Error(budget.stopReason));
  throw new Error(budget.stopReason);
}
export function assertWorkflowBudget(
  root: string,
  id: string,
  milestone?: number,
): WorkflowBudget {
  const budget = read(root, id);
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
  const budget = workflowBudget(root, record);
  owns(budget);
  const next = record.approved
    ? record.milestones.findIndex((item) => !item.completed)
    : -1;
  const limit = reason(budget, next < 0 ? undefined : next);
  if (limit) stop(root, budget, limit);
  budget.ownerPid = process.pid;
  budget.state = 'active';
  budget.stopReason = '';
  save(root, budget);
  write(path.join(root, 'agent-workflows', 'current.json'), { id: record.id });
}
export function hasOpenWorkflowBudget(root: string): boolean {
  const pointer = path.join(root, 'agent-workflows', 'current.json');
  if (!fs.existsSync(pointer)) return false;
  const { id } = z
    .object({ id: z.string().uuid() })
    .parse(JSON.parse(fs.readFileSync(pointer, 'utf8')));
  return read(root, id).state !== 'closed';
}
export function setWorkflowBudget(
  root: string,
  record: AgentWorkflow,
  limits: WorkflowBudgetLimits,
): void {
  const budget = workflowBudget(root, record);
  owns(budget);
  save(root, {
    ...budget,
    ...limitsSchema.parse(limits),
    ownerPid: process.pid,
  });
}
export function closeWorkflowBudget(root: string, record: AgentWorkflow): void {
  const budget = workflowBudget(root, record);
  owns(budget);
  budget.state = 'closed';
  save(root, budget);
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
    const pointer = path.join(stateRoot, 'agent-workflows', 'current.json');
    if (!fs.existsSync(pointer)) return;
    id = z
      .object({ id: z.string().uuid() })
      .parse(JSON.parse(fs.readFileSync(pointer, 'utf8'))).id;
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
