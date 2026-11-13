/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { lock, lockSync } from 'proper-lockfile';
import { z } from 'zod';
import type { WorkflowAgentResult } from './agentWorkflows.js';
import { hasOpenWorkflowBudget } from './workflowBudget.js';
import { assertAgentAuthorization } from './agentAuthorization.js';
import { withAgentTaskLock } from './agentTaskLock.js';
import {
  swarmResultArchiveSchema,
  saveSwarmResultText,
  readSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';
import { swarmContextSnapshot, swarmMemberContext } from './swarmContext.js';
import { SwarmBudgetError } from './swarmBudgetError.js';
import { I18nManager } from '../i18n/i18nManager.js';
import {
  reviewFilesSchema,
  reviewedFilesSchema,
  captureReviewFiles,
  reviewFilesUnchanged,
} from './swarmReviewFiles.js';
import {
  inAgentWorktree,
  readAgentWorktree,
  acceptReviewedAgentWorktree,
  agentWorktreeTree,
} from './agentWorktree.js';
import {
  agentModelSpecSchema,
  swarmRoleModelsSchema,
  swarmRoleSchema,
  normalizeAgentModel,
  withAgentModel,
} from './agentModelRouting.js';

const memberSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  agent: swarmRoleSchema,
  brief: z.string().min(1).max(8000),
  state: z.enum(['queued', 'working', 'waiting', 'paused', 'killed']),
  lastRead: z.number().int().nonnegative().default(0),
  turns: z.number().int().nonnegative().default(0),
  result: z.string().max(12000).default(''),
  fullResult: swarmResultArchiveSchema.optional(),
  lastError: z.string().max(12000).optional(),
  verifiedRevision: z.number().int().optional(),
  verifiedTree: z.string().optional(),
  reviewFiles: reviewFilesSchema.optional(),
  reviewedFiles: reviewedFilesSchema.optional(),
  model: agentModelSpecSchema.optional(),
  modelsUsed: z.array(z.string().max(512)).max(16).default([]),
});
const reviewVerdictSchema = z.object({
  passed: z.boolean(),
  summary: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
});
function parseReviewVerdict(text: string) {
  try {
    return reviewVerdictSchema.safeParse(JSON.parse(text));
  } catch {
    return undefined;
  }
}
const budgetSchema = z.object({
  maxRequests: z.number().int().min(1).max(10000).default(120),
  maxFailedTurns: z.number().int().min(1).max(100).default(2),
  maxTurns: z.number().int().min(1).max(1000).default(40),
  requests: z.number().int().nonnegative().default(0),
  failedTurns: z.number().int().nonnegative().default(0),
  turns: z.number().int().nonnegative().default(0),
});
const swarmSchema = z.object({
  id: z.string().uuid(),
  objective: z.string().trim().min(1).max(16000),
  phase: z.enum(['active', 'blocked', 'completed', 'cancelled']),
  budget: budgetSchema.default({}),
  stopReason: z.string().default(''),
  revision: z.number().int().nonnegative().default(0),
  ownerPid: z.number().int().positive(),
  members: z.array(memberSchema).max(12).default([]),
  budgetVersion: z.literal(1).optional(),
  accountingUnknown: z.boolean().default(false),
  recoveryPath: z.string().optional(),
  roleModels: swarmRoleModelsSchema.default({}),
  memberModels: z
    .record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), agentModelSpecSchema)
    .default({}),
  worktreeRequired: z.boolean().default(false),
  workspace: z.string().min(1).optional(),
});
const ownerSchema = z.object({
  id: z.string().uuid(),
  ownerPid: z.number().int().positive(),
  budgetVersion: z.literal(1),
  accountingUnknown: z.boolean().default(false),
  recoveryPath: z.string().optional(),
  bindingRecoveryPath: z.string().optional(),
  ownerRecoveryPath: z.string().optional(),
});
const unavailable =
  'Historical swarm usage is unavailable. This cancelled swarm cannot resume or receive a new budget; create a scoped successor.';
class DamagedSwarmError extends Error {}
function missing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
function recoverable(error: unknown): boolean {
  return error instanceof DamagedSwarmError || missing(error);
}
function readJson(file: string, limit: number): unknown {
  if (fs.statSync(file).size > limit)
    throw new DamagedSwarmError(
      'Swarm state exceeds its size limit; use /swarm cancel <id> to preserve and cancel it.',
    );
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new DamagedSwarmError(
        'Swarm state is damaged; use /swarm cancel <id> to preserve and cancel it.',
      );
    throw error;
  }
}
function readOwner(root: string, id: string) {
  const file = path.join(directory(root, id), 'owner.json');
  if (!fs.existsSync(file)) return undefined;
  const result = ownerSchema.safeParse(readJson(file, 16384));
  if (!result.success || result.data.id !== id)
    throw new DamagedSwarmError(
      'Swarm owner state is damaged; cancellation requires a valid owner record.',
    );
  return result.data;
}
function owns(ownerPid: number): void {
  if (ownerPid === process.pid) return;
  try {
    process.kill(ownerPid, 0);
  } catch (error) {
    if (isProcessMissing(error)) return;
    throw error;
  }
  throw new Error('Cancel or resume this swarm from its owning CLI session.');
}
function readPointer(root: string) {
  const file = path.join(root, 'swarms', 'latest.json');
  if (!fs.existsSync(file)) return undefined;
  const result = z
    .object({
      id: z.string().uuid(),
      ownerPid: z.number().int().positive().optional(),
    })
    .safeParse(readJson(file, 4096));
  if (!result.success)
    throw new DamagedSwarmError(
      'Swarm binding is damaged; use /swarm cancel <id> with the saved swarm ID.',
    );
  return result.data;
}
export type Swarm = z.infer<typeof swarmSchema>;
export type SwarmMember = z.infer<typeof memberSchema>;
/** A failed attempt must not replace evidence from an earlier accepted result. */
function recordMemberFailure(member: SwarmMember, message: string): void {
  member.lastError = message.slice(0, 12000);
  if (!member.result && !member.fullResult) member.result = member.lastError;
}
export type SwarmAgentRunner = (
  agent: SwarmMember['agent'],
  prompt: string,
  signal: AbortSignal,
) => Promise<WorkflowAgentResult>;
export type SwarmBudgetLimits = Pick<
  Swarm['budget'],
  'maxRequests' | 'maxFailedTurns' | 'maxTurns'
>;
export interface SwarmPost {
  seq: number;
  sender: string;
  text: string;
  time: string;
}
interface SwarmActor {
  root: string;
  id: string;
  name: string;
}
const actors = new AsyncLocalStorage<SwarmActor>();
export const currentSwarmActor = () => actors.getStore();
function isProcessMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ESRCH'
  );
}
function directory(root: string, id: string): string {
  z.string().uuid().parse(id);
  return path.join(root, 'swarms', id);
}
function writeJson(file: string, value: unknown): void {
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
export function readSwarm(root: string, id: string): Swarm {
  const file = path.join(directory(root, id), 'members.json');
  // Twelve schema-valid UTF-8 member briefs and results can exceed 256 KiB.
  const raw = readJson(file, 2 * 1024 * 1024);
  const parsed = swarmSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== id)
    throw new DamagedSwarmError(
      'Swarm member state is damaged; use /swarm cancel <id> to preserve it.',
    );
  const swarm = parsed.data;
  if (typeof raw === 'object' && raw !== null && 'budget' in raw) {
    const value = raw.budget;
    const fields = [
      'maxRequests',
      'maxFailedTurns',
      'maxTurns',
      'requests',
      'failedTurns',
      'turns',
    ];
    if (
      typeof value !== 'object' ||
      value === null ||
      !fields.every((field) => Object.hasOwn(value, field))
    )
      throw new DamagedSwarmError(
        'Tracked swarm budget has missing counters; use /swarm cancel <id> rather than resetting usage.',
      );
  }
  // Existing records already spent these turns. Migration must not grant them again.
  if (typeof raw === 'object' && raw !== null && !('budget' in raw)) {
    if (swarm.budgetVersion || readOwner(root, id)?.budgetVersion)
      throw new DamagedSwarmError(
        'Tracked swarm budget is missing; cancel locally instead of resetting old usage.',
      );
    swarm.budget.turns = swarm.members.reduce(
      (sum, member) => sum + member.turns,
      0,
    );
    swarm.budget.failedTurns = swarm.members.filter(
      (member) => member.state === 'paused' && member.result,
    ).length;
  }
  const owner = readOwner(root, id);
  if (owner?.accountingUnknown) {
    swarm.accountingUnknown = true;
    swarm.recoveryPath = owner.recoveryPath;
    swarm.phase = 'cancelled';
    swarm.stopReason = unavailable;
  }
  return swarm;
}
function saveSwarm(root: string, value: Swarm): void {
  value.budgetVersion = 1;
  writeJson(
    path.join(directory(root, value.id), 'owner.json'),
    ownerSchema.parse({
      ...readOwner(root, value.id),
      id: value.id,
      ownerPid: value.ownerPid,
      budgetVersion: 1,
      accountingUnknown: value.accountingUnknown,
      recoveryPath: value.recoveryPath,
    }),
  );
  writeJson(
    path.join(directory(root, value.id), 'members.json'),
    swarmSchema.parse(value),
  );
}
export function latestSwarm(root: string): Swarm | undefined {
  const pointer = readPointer(root);
  return pointer ? readSwarm(root, pointer.id) : undefined;
}
/** Refuse another workflow before it changes state or initializes a budget. */
export function assertNoPendingSwarm(root: string): void {
  const swarm = latestSwarm(root);
  if (
    swarm &&
    (['active', 'blocked'].includes(swarm.phase) ||
      isSwarmRunning(root, swarm.id))
  )
    throw new Error(
      'Resolve the pending swarm with finish or cancel before resuming or running a workflow.',
    );
}
export function readSwarmBoard(root: string, id: string): SwarmPost[] {
  const file = path.join(directory(root, id), 'board.jsonl');
  if (fs.statSync(file).size > 4 * 1024 * 1024)
    throw new Error('Swarm board limit exceeded.');
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) =>
      z
        .object({
          seq: z.number().int().positive(),
          sender: z.string(),
          text: z.string(),
          time: z.string(),
        })
        .parse(JSON.parse(line)),
    );
}
function preparePost(root: string, id: string, sender: string, text: string) {
  const file = path.join(directory(root, id), 'board.jsonl');
  const board = readSwarmBoard(root, id);
  if (board.length >= 500)
    throw new Error(
      'Swarm board reached its 500-post limit; preserve this board and start a scoped successor.',
    );
  const entry = {
    seq: board.length + 1,
    sender,
    text: z.string().trim().min(1).max(4000).parse(text),
    time: new Date().toISOString(),
  };
  const line = JSON.stringify(entry) + '\n';
  if (fs.statSync(file).size + Buffer.byteLength(line) > 4 * 1024 * 1024)
    throw new Error('Swarm board limit exceeded.');
  return { entry, line };
}
function appendPost(
  root: string,
  id: string,
  sender: string,
  text: string,
): SwarmPost {
  return withPreparedPost(root, id, sender, text, () => {});
}
/** Admission checks and state changes share the board lock; no async work here. */
function withPreparedPost(
  root: string,
  id: string,
  sender: string,
  text: string,
  changeState: () => void,
): SwarmPost {
  const file = path.join(directory(root, id), 'board.jsonl');
  const release = lockSync(file, { realpath: false, retries: 0 });
  try {
    const { entry, line } = preparePost(root, id, sender, text);
    changeState();
    fs.appendFileSync(file, line, { mode: 0o600 });
    return entry;
  } finally {
    release();
  }
}
export function createSwarm(root: string, objective: string): Swarm {
  return withAgentTaskLock(root, () => createSwarmState(root, objective));
}
function createSwarmState(root: string, objective: string): Swarm {
  if (hasOpenWorkflowBudget(root))
    throw new Error(
      'Resolve the pending workflow with resume or cancel before starting a swarm.',
    );
  if (['active', 'blocked'].includes(latestSwarm(root)?.phase ?? ''))
    throw new Error(
      'Resolve the active swarm with finish or cancel before starting another.',
    );
  assertNoPendingSwarm(root);
  const swarm = swarmSchema.parse({
    id: randomUUID(),
    objective,
    phase: 'active',
    ownerPid: process.pid,
  });
  fs.mkdirSync(directory(root, swarm.id), { recursive: true });
  fs.writeFileSync(path.join(directory(root, swarm.id), 'board.jsonl'), '', {
    mode: 0o600,
  });
  saveSwarm(root, swarm);
  writeJson(path.join(root, 'swarms/latest.json'), {
    id: swarm.id,
    ownerPid: swarm.ownerPid,
  });
  appendPost(root, swarm.id, 'coordinator', objective.slice(0, 4000));
  return swarm;
}
export function swarmSnapshot(root: string, id: string) {
  const swarm = readSwarm(root, id);
  return {
    ...swarm,
    worktree: readAgentWorktree(root, id),
    budget: swarm.accountingUnknown
      ? { ...swarm.budget, requests: null, failedTurns: null, turns: null }
      : swarm.budget,
    members: swarm.members.map((member) => ({
      ...member,
      result: member.result.slice(0, 2000),
      lastError: member.lastError?.slice(0, 2000),
      ...(member.fullResult
        ? {
            fullResultPath: swarmResultArchivePath(root, id, member.fullResult),
          }
        : {}),
    })),
    boardPath: path.join(directory(root, id), 'board.jsonl'),
    recentPosts: readSwarmBoard(root, id).slice(-12),
  };
}
/** Model view is separate from the public CLI/UI snapshot. */
export function swarmModelSnapshot(root: string, id: string) {
  return {
    ...swarmContextSnapshot(
      root,
      readSwarm(root, id),
      readSwarmBoard(root, id),
    ),
    worktree: readAgentWorktree(root, id),
  };
}
function mentions(text: string, name: string): boolean {
  return [
    ...text.matchAll(/(?:^|[^a-z0-9_-])@([a-z0-9-]+)(?![a-z0-9_-])/gi),
  ].some(
    (match) =>
      match[1].toLowerCase() === name || match[1].toLowerCase() === 'all',
  );
}
const engines = new Map<string, SwarmEngine>();
function engineKey(root: string, id: string) {
  return directory(root, id);
}
const writerQueues = new Map<string, Promise<void>>();

function exhaustedBudget(swarm: Swarm): string | undefined {
  const budget = swarm.budget;
  if (budget.requests >= budget.maxRequests) return 'model dispatch';
  if (budget.failedTurns >= budget.maxFailedTurns) return 'failed-turn';
  if (budget.turns >= budget.maxTurns) return 'member-turn';
  return undefined;
}
function blockSwarm(root: string, swarm: Swarm, limit: string): void {
  if (swarm.phase !== 'active') return;
  swarm.phase = 'blocked';
  swarm.stopReason = `Swarm ${limit} budget exhausted. Results retained. Use /swarm budget <requests> <failed-turns> <turns> to increase limits, then /swarm resume; or /swarm cancel.`;
  for (const member of swarm.members)
    if (['working', 'queued'].includes(member.state)) member.state = 'paused';
  saveSwarm(root, swarm);
  // Abort other in-flight members, including those queued for the writer lock.
  engines.get(engineKey(root, swarm.id))?.stopMembers();
  appendPost(root, swarm.id, 'monitor', swarm.stopReason);
}

function swarmBudgetHandoff(root: string, swarm: Swarm): SwarmBudgetError {
  const i18n = I18nManager.getInstance();
  const lines = [
    `${i18n.t('蜂群已在本地受阻', 'Swarm blocked locally')}: ${swarm.id}`,
    swarm.stopReason,
    `${i18n.t('保留状态与成员结果', 'Saved state and member results')}: ${path.join(directory(root, swarm.id), 'members.json')}`,
    `${i18n.t('公开留言', 'Shared board')}: ${path.join(directory(root, swarm.id), 'board.jsonl')}`,
  ];
  const paused = swarm.members
    .filter(
      (member) =>
        member.state === 'paused' && (member.lastError || member.result),
    )
    .slice(-3);
  for (const member of paused) {
    // These are bounded excerpts, potentially from an earlier accepted result.
    // Keep them distinct from a current verdict and prefer the latest error.
    lines.push(
      `${i18n.t('暂停成员保留摘要（不代表本轮完成）', 'Retained paused-member excerpt (not turn completion)')} @${member.name}:`,
      (member.lastError || member.result).slice(0, 1200),
    );
  }
  if (paused.length)
    lines.push(
      i18n.t(
        '先查看成员原因与完整结果；增加调度预算不会修复成员错误。仅按用户允许的范围处理与续跑。',
        'Inspect the member cause and full result first. Increasing the dispatch budget does not fix a member error. Continue only within the user-authorized scope.',
      ),
    );
  const reviewer = swarm.members.findLast(
    (member) => member.agent === 'workflow-auditor' && !!member.result,
  );
  if (reviewer) {
    try {
      const verdict = parseReviewVerdict(
        readSwarmResultText(root, swarm.id, reviewer),
      );
      if (verdict?.success) {
        lines.push(
          `${i18n.t('已保存的复核', 'Saved review')} @${reviewer.name}: ${verdict.data.passed ? i18n.t('通过（不代表任务完成）', 'passed (not task completion)') : i18n.t('未通过', 'failed')}`,
          verdict.data.summary.slice(0, 2000),
          ...(verdict.data.evidence ?? [])
            .slice(0, 5)
            .map((item) => item.slice(0, 500)),
        );
      } else {
        lines.push(
          i18n.t(
            '复核结果格式无效，请查看保留状态。',
            'Saved review is not a valid verdict; inspect the retained state.',
          ),
        );
      }
    } catch {
      lines.push(
        i18n.t(
          '复核全文不可读取，请保留现场并查看状态文件。',
          'Saved review text is unavailable; preserve the evidence and inspect the state file.',
        ),
      );
    }
  }
  for (const member of swarm.members) {
    if (member.fullResult)
      lines.push(
        `@${member.name}: ${swarmResultArchivePath(root, swarm.id, member.fullResult)}`,
      );
  }
  return new SwarmBudgetError(lines.join('\n'));
}

/** Reserve a model dispatch before delegating to any provider. SDK-internal HTTP
 * retries are not observable here; application-level retries reserve again. */
export function consumeSwarmRequest(root: string | undefined): void {
  const actor = currentSwarmActor();
  if (!root && !actor) return;
  const stateRoot = actor?.root ?? root!;
  const swarm = actor ? readSwarm(stateRoot, actor.id) : latestSwarm(stateRoot);
  if (!swarm || swarm.ownerPid !== process.pid) return;
  if (swarm.phase === 'blocked') throw swarmBudgetHandoff(stateRoot, swarm);
  if (swarm.phase !== 'active') {
    if (actor)
      throw new Error(`Swarm is ${swarm.phase}; member calls are stopped.`);
    return;
  }
  // A final allowed turn may finish using the remaining requests.
  const limit =
    swarm.budget.requests >= swarm.budget.maxRequests
      ? 'model dispatch'
      : swarm.budget.failedTurns >= swarm.budget.maxFailedTurns
        ? 'failed-turn'
        : undefined;
  if (limit) {
    blockSwarm(stateRoot, swarm, limit);
    throw swarmBudgetHandoff(stateRoot, swarm);
  }
  swarm.budget.requests++;
  saveSwarm(stateRoot, swarm);
}

/** Only exposed by the local slash command, never as a model tool. Counters are cumulative. */
export function setSwarmBudget(
  root: string,
  id: string,
  limits: SwarmBudgetLimits,
): void {
  const swarm = readSwarm(root, id);
  if (swarm.accountingUnknown) throw new Error(unavailable);
  if (swarm.ownerPid !== process.pid) {
    try {
      process.kill(swarm.ownerPid, 0);
      throw new Error('Change the budget from the owning CLI session.');
    } catch (error) {
      if (!isProcessMissing(error)) throw error;
    }
    swarm.ownerPid = process.pid;
    for (const member of swarm.members)
      if (['working', 'queued'].includes(member.state)) member.state = 'paused';
  }
  if (swarm.phase === 'completed')
    throw new Error('A completed swarm cannot change its budget.');
  swarm.budget = budgetSchema.parse({ ...swarm.budget, ...limits });
  saveSwarm(root, swarm);
  appendPost(
    root,
    id,
    'coordinator',
    `User set cumulative budget limits: ${JSON.stringify(limits)}. Counters were not reset.`,
  );
  const limit = exhaustedBudget(swarm);
  if (limit) blockSwarm(root, swarm, limit);
}

/** Local slash-command assignment; never changes the process-wide active model. */
export function setSwarmModel(
  root: string,
  id: string,
  target: string,
  modelSpec: string,
): void {
  const swarm = readSwarm(root, id);
  owns(swarm.ownerPid);
  if (swarm.accountingUnknown) throw new Error(unavailable);
  if (swarm.phase === 'completed')
    throw new Error('A completed swarm cannot change member models.');
  const model = normalizeAgentModel(modelSpec);
  if (target.startsWith('@')) {
    const name = memberSchema.shape.name.parse(target.slice(1));
    if (['all', 'coordinator', 'monitor'].includes(name))
      throw new Error('Choose a worker name or role.');
    const member = swarm.members.find((entry) => entry.name === name);
    if (member?.state === 'killed')
      throw new Error('A killed member cannot change models.');
    if (member && ['working', 'queued'].includes(member.state))
      throw new Error(
        'Wait for this member to finish before changing its model.',
      );
    if (member) member.model = model;
    if (model) swarm.memberModels[name] = model;
    else delete swarm.memberModels[name];
  } else {
    const role = swarmRoleSchema.parse(target);
    if (
      swarm.members.some(
        (member) =>
          member.agent === role && ['working', 'queued'].includes(member.state),
      )
    )
      throw new Error(
        'Wait for this role to finish before changing its model.',
      );
    swarm.roleModels[role] = model;
  }
  saveSwarm(root, swarm);
  appendPost(
    root,
    id,
    'coordinator',
    `User selected model for ${target}: ${model ?? 'inherit'}. Applies to future turns; cumulative budgets are retained.`,
  );
}

/** Event-driven native members. Waiting has no timers and makes no model requests. */
export class SwarmEngine {
  private readonly running = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  constructor(
    private readonly root: string,
    readonly id: string,
    private readonly runAgent: SwarmAgentRunner,
  ) {
    const swarm = readSwarm(root, id);
    if (swarm.ownerPid !== process.pid) {
      let ownerAlive = true;
      try {
        process.kill(swarm.ownerPid, 0);
      } catch (error) {
        ownerAlive = !isProcessMissing(error);
      }
      if (ownerAlive)
        throw new Error(
          'This swarm belongs to another live CLI process; steer it from that session.',
        );
      swarm.ownerPid = process.pid;
      for (const member of swarm.members)
        if (['working', 'queued'].includes(member.state))
          member.state = 'paused';
      saveSwarm(root, swarm);
      appendPost(
        root,
        id,
        'monitor',
        'Recovered after the owner process exited. Interrupted members are paused; explicitly mention them to resume.',
      );
    }
  }
  bindWorkspace(directory: string): void {
    const workspace = fs.realpathSync.native(directory);
    const swarm = readSwarm(this.root, this.id);
    owns(swarm.ownerPid);
    if (swarm.workspace && path.relative(swarm.workspace, workspace) !== '')
      throw new Error(
        'This swarm is bound to another workspace; use its original workspace.',
      );
    if (!swarm.workspace) {
      swarm.workspace = workspace;
      saveSwarm(this.root, swarm);
    }
  }
  add(
    name: string,
    agent: SwarmMember['agent'],
    brief: string,
    reviewFiles?: string[],
  ): void {
    const swarm = this.activeState();
    assertAgentAuthorization(agent);
    if (reviewFiles && agent !== 'workflow-auditor')
      throw new Error(
        'review_files is only available for independent auditors.',
      );
    if (agent === 'workflow-auditor' && swarm.workspace && !reviewFiles)
      throw new Error(
        'Adding an independent auditor requires review_files listing the artifacts to verify.',
      );
    const member = memberSchema.parse({
      name,
      agent,
      brief,
      state: 'waiting',
      model: swarm.memberModels[name],
      reviewFiles,
    });
    if (
      ['all', 'coordinator', 'monitor'].includes(name) ||
      swarm.members.some((entry) => entry.name === name)
    )
      throw new Error(
        'Member name is reserved or already used; killed names cannot be revived.',
      );
    if (swarm.members.length >= 12)
      throw new Error('A swarm supports at most 12 named members.');
    withPreparedPost(
      this.root,
      this.id,
      'coordinator',
      `@${name} Public brief (${agent}): ${brief}`.slice(0, 4000),
      () => {
        swarm.members.push(member);
        saveSwarm(this.root, swarm);
      },
    );
    this.wake(name);
  }
  setReviewFiles(name: string, reviewFiles: string[]): void {
    const swarm = this.activeState();
    const member = swarm.members.find((entry) => entry.name === name);
    if (
      !member ||
      member.agent !== 'workflow-auditor' ||
      member.state === 'killed'
    )
      throw new Error(
        'Review files can only be assigned to an existing independent auditor.',
      );
    if (this.running.has(name))
      throw new Error(
        'Wait for this auditor to settle before changing its review files.',
      );
    member.reviewFiles = reviewFilesSchema.parse(reviewFiles);
    member.verifiedRevision = undefined;
    member.verifiedTree = undefined;
    member.reviewedFiles = undefined;
    saveSwarm(this.root, swarm);
  }
  post(
    sender: string,
    text: string,
    review?: { name: string; files: string[] },
  ): void {
    const swarm = this.activeState();
    if (
      sender !== 'coordinator' &&
      !swarm.members.some(
        (member) => member.name === sender && member.state !== 'killed',
      )
    )
      throw new Error(
        'Only an active member may post under its assigned identity.',
      );
    if (
      review &&
      (sender !== 'coordinator' || !text.includes(`@${review.name}`))
    )
      throw new Error(
        'Review reassignment requires an explicit coordinator @mention.',
      );
    const post = withPreparedPost(this.root, this.id, sender, text, () => {
      if (review) this.setReviewFiles(review.name, review.files);
    });
    for (const member of readSwarm(this.root, this.id).members) {
      if (readSwarm(this.root, this.id).phase !== 'active') break;
      if (
        member.name !== sender &&
        member.state !== 'killed' &&
        mentions(post.text, member.name)
      )
        this.wake(member.name);
    }
  }
  remove(name: string): void {
    const swarm = this.activeState();
    const member = swarm.members.find((entry) => entry.name === name);
    if (!member) throw new Error('Unknown member.');
    withPreparedPost(
      this.root,
      this.id,
      'coordinator',
      `${name} removed; its reports remain on the board.`,
      () => {
        member.state = 'killed';
        saveSwarm(this.root, swarm);
      },
    );
    this.running.get(name)?.controller.abort();
  }
  cancel(): void {
    this.stopMembers();
    const swarm = readSwarm(this.root, this.id);
    if (swarm.phase === 'completed') return;
    swarm.phase = 'cancelled';
    for (const member of swarm.members)
      if (member.state !== 'killed') member.state = 'paused';
    saveSwarm(this.root, swarm);
  }
  stopMembers(): void {
    for (const run of this.running.values()) run.controller.abort();
  }
  hasRunningMembers(): boolean {
    return this.running.size > 0;
  }
  async wait(signal: AbortSignal): Promise<void> {
    let cancellationFailure: { error: unknown } | undefined;
    const cancel = () => {
      // Always interrupt members, including when persisting cancellation fails.
      this.stopMembers();
      try {
        this.cancel();
      } catch (error) {
        // Abort event listeners must not throw outside the wait promise.
        cancellationFailure = { error };
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) cancel();
      while (this.running.size) {
        await Promise.allSettled(
          [...this.running.values()].map((entry) => entry.promise),
        );
      }
      if (cancellationFailure) throw cancellationFailure.error;
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  finish(): void {
    const swarm = this.activeState();
    if (
      this.running.size ||
      swarm.members.some((member) =>
        ['working', 'queued', 'paused'].includes(member.state),
      )
    )
      throw new Error(
        'Members are still working, queued or paused. Resolve them before completion.',
      );
    const verifier = swarm.members.find((member) => {
      if (
        member.agent !== 'workflow-auditor' ||
        member.state === 'killed' ||
        member.verifiedRevision !== swarm.revision
      )
        return false;
      // Old saved approval markers cannot authorize a verdict that no longer
      // satisfies the current acceptance contract.
      const verdict = parseReviewVerdict(
        readSwarmResultText(this.root, this.id, member),
      );
      if (!verdict?.success || !verdict.data.passed) return false;
      if (!swarm.workspace) return true;
      const directory =
        readAgentWorktree(this.root, this.id)?.directory ?? swarm.workspace;
      return (
        !!member.reviewedFiles &&
        reviewFilesUnchanged(directory, member.reviewedFiles)
      );
    });
    if (!verifier)
      throw new Error(
        'A current independent verifier verdict and unchanged reviewed files are required before finishing.',
      );
    for (const member of swarm.members)
      readSwarmResultText(this.root, this.id, member);
    withPreparedPost(
      this.root,
      this.id,
      'coordinator',
      'Swarm completed after the current independent verifier accepted the deliverable.',
      () => {
        acceptReviewedAgentWorktree(this.root, this.id, verifier.verifiedTree);
        swarm.phase = 'completed';
        saveSwarm(this.root, swarm);
      },
    );
  }
  private activeState(): Swarm {
    const swarm = readSwarm(this.root, this.id);
    if (swarm.phase !== 'active')
      throw new Error(
        `Swarm is ${swarm.phase}; no new member turns are allowed.`,
      );
    return swarm;
  }
  private wake(name: string): void {
    if (this.running.has(name)) return;
    const swarm = this.activeState();
    const member = swarm.members.find((entry) => entry.name === name);
    if (!member || member.state === 'killed') return;
    if (
      member.agent === 'workflow-auditor' &&
      swarm.workspace &&
      member.reviewFiles === undefined
    ) {
      member.state = 'paused';
      member.verifiedRevision = undefined;
      member.verifiedTree = undefined;
      member.reviewedFiles = undefined;
      recordMemberFailure(
        member,
        'This saved auditor requires explicit review_files before resuming. Assign its deliverable file list, or [] only for member-report-only tasks, then explicitly @mention it.',
      );
      saveSwarm(this.root, swarm);
      appendPost(this.root, this.id, name, `paused: ${member.lastError}`);
      return;
    }
    const limit = exhaustedBudget(swarm);
    if (limit) {
      blockSwarm(this.root, swarm, limit);
      return;
    }
    if (member.turns >= 20) {
      member.state = 'paused';
      recordMemberFailure(
        member,
        'Member reached the 20-turn wake budget; task-wide counters are retained for all successors.',
      );
      saveSwarm(this.root, swarm);
      appendPost(
        this.root,
        this.id,
        name,
        `paused: ${member.lastError}`.slice(0, 4000),
      );
      return;
    }
    member.state = 'queued';
    member.turns++;
    swarm.budget.turns++;
    saveSwarm(this.root, swarm);
    const controller = new AbortController();
    // Defer to a microtask so the running entry exists before any callback posts.
    const promise = Promise.resolve()
      .then(() => this.turn(name, controller.signal))
      .finally(() => {
        this.running.delete(name);
        const latest = readSwarm(this.root, this.id);
        const current = latest.members.find((entry) => entry.name === name);
        if (
          latest.phase === 'active' &&
          current?.state === 'waiting' &&
          readSwarmBoard(this.root, this.id).some(
            (post) =>
              post.seq > current.lastRead &&
              post.sender !== name &&
              mentions(post.text, name),
          )
        )
          this.wake(name);
      });
    // Keep background failures observed even when the coordinator is not waiting.
    void promise.catch(() => {});
    this.running.set(name, { controller, promise });
  }
  private async turn(name: string, signal: AbortSignal): Promise<void> {
    let release: (() => Promise<void>) | undefined;
    let releaseQueue: (() => void) | undefined;
    let modelsUsed: string[] = [];
    try {
      let swarm = this.activeState();
      let member = swarm.members.find((entry) => entry.name === name)!;
      if (!['researcher', 'redteam-analyst'].includes(member.agent)) {
        const previous = writerQueues.get(this.root) || Promise.resolve();
        const queued = new Promise<void>((resolve) => {
          releaseQueue = resolve;
        });
        writerQueues.set(
          this.root,
          previous.then(() => queued),
        );
        await previous;
        signal.throwIfAborted();
        const lockTarget = path.join(this.root, 'agent-workflows');
        fs.mkdirSync(lockTarget, { recursive: true });
        release = await lock(lockTarget, { realpath: false, retries: 0 });
      }
      signal.throwIfAborted();
      swarm = this.activeState();
      member = swarm.members.find((entry) => entry.name === name)!;
      assertAgentAuthorization(member.agent);
      const board = readSwarmBoard(this.root, this.id);
      member.lastRead = board.at(-1)?.seq || 0;
      member.state = 'working';
      member.verifiedRevision = undefined;
      member.verifiedTree = undefined;
      member.reviewedFiles = undefined;
      if (member.agent !== 'workflow-auditor') swarm.revision++;
      const revision = swarm.revision;
      const reviewedTree =
        member.agent === 'workflow-auditor'
          ? agentWorktreeTree(this.root, this.id)
          : undefined;
      const reviewDirectory =
        readAgentWorktree(this.root, this.id)?.directory ?? swarm.workspace;
      const reviewedFiles =
        member.agent === 'workflow-auditor' &&
        swarm.workspace &&
        reviewDirectory
          ? captureReviewFiles(
              reviewDirectory,
              reviewFilesSchema.parse(member.reviewFiles),
            )
          : undefined;
      saveSwarm(this.root, swarm);
      let memberSignal = signal;
      const result = await actors.run(
        { root: this.root, id: this.id, name },
        () =>
          withAgentModel(
            member.model ?? swarm.roleModels[member.agent],
            () =>
              inAgentWorktree(
                this.root,
                this.id,
                (directory) => {
                  memberSignal = AbortSignal.any([
                    signal,
                    AbortSignal.timeout(10 * 60 * 1000),
                  ]);
                  return this.runAgent(
                    member.agent,
                    `${directory ? `ISOLATED TASK WORKTREE: ${directory}. Resolve assigned repository paths here; do not edit the source checkout. Git-ignored dependencies are not copied. This is a working-directory boundary, not an OS sandbox.\n` : ''}${swarmMemberContext(this.root, swarm, member, board)}\nWork only within your assigned scope; preserve unrelated changes. Writes share a workspace and are serialized. Communicate publicly with post_swarm_message; @name or @all mentions wake peers. Do not continually mention completed peers. Finish this turn through complete_task when you have a result or need to wait; you then wait without model calls until mentioned. No fabricated checks; run only necessary checks allowed by the user. Verifiers must independently inspect current artifacts and return passed, summary, evidence through complete_task.`,
                    memberSignal,
                  );
                },
                swarm.worktreeRequired,
              ),
            (models) => {
              modelsUsed = models;
            },
          ),
      );
      swarm = readSwarm(this.root, this.id);
      member = swarm.members.find((entry) => entry.name === name)!;
      const timedOut = memberSignal.aborted && !signal.aborted;
      const stopped =
        memberSignal.aborted ||
        swarm.phase !== 'active' ||
        member.state === 'killed';
      const hadResult = !!member.result || !!member.fullResult;
      if (stopped || (!result.completed && hadResult)) {
        // A runner may return completion after cancellation. Retain that output
        // as an unaccepted attempt rather than replacing earlier evidence.
        const diagnostic = timedOut
          ? 'Member turn timed out; late output was not accepted.'
          : stopped
            ? 'Member turn was stopped; late output was not accepted.'
            : 'Member turn did not complete.';
        const partial = saveSwarmResultText(
          this.root,
          this.id,
          `${diagnostic}\n${result.text}`,
        );
        recordMemberFailure(
          member,
          partial.fullResult
            ? `${diagnostic}\nPartial output archived: ${swarmResultArchivePath(this.root, this.id, partial.fullResult)}\n${partial.result}`
            : partial.result,
        );
        if (!hadResult) member.modelsUsed = modelsUsed;
      } else {
        const saved = saveSwarmResultText(this.root, this.id, result.text);
        member.result = saved.result;
        member.fullResult = saved.fullResult;
        member.lastError = undefined;
        member.modelsUsed = modelsUsed;
      }
      // A late research result may invalidate an auditor that started earlier.
      if (member.agent !== 'workflow-auditor') swarm.revision++;
      if (member.state !== 'killed')
        member.state = stopped || !result.completed ? 'paused' : 'waiting';
      if (
        member.agent === 'workflow-auditor' &&
        result.completed &&
        member.state === 'waiting'
      ) {
        // Postflight worktree reads can throw. Retain this raw verdict and its
        // archive reference before checking approval, so failure recovery reads
        // the current evidence rather than an older member result.
        saveSwarm(this.root, swarm);
        const verdict = parseReviewVerdict(result.text);
        if (!verdict?.success) {
          member.state = 'paused';
          recordMemberFailure(
            member,
            'Independent reviewer returned an invalid verdict. Expected JSON with passed, a nonblank summary and nonblank evidence entries. Raw reviewer output is retained; inspect it before an explicitly authorized correction.',
          );
        }
        if (
          verdict?.success &&
          verdict.data.passed &&
          swarm.revision === revision
        ) {
          if (
            reviewedTree &&
            agentWorktreeTree(this.root, this.id) !== reviewedTree
          )
            throw new Error(
              'Isolated files changed during independent review; inspect the current worktree again.',
            );
          if (
            reviewedFiles &&
            !reviewFilesUnchanged(reviewDirectory!, reviewedFiles)
          ) {
            member.state = 'paused';
            recordMemberFailure(
              member,
              'Reviewed files changed or became unavailable during independent review. Raw reviewer output is retained; inspect the current files before a new review.',
            );
          } else {
            member.verifiedRevision = revision;
            member.verifiedTree = reviewedTree;
            member.reviewedFiles = reviewedFiles;
          }
        }
      }
      if (
        swarm.phase === 'active' &&
        !signal.aborted &&
        (timedOut ||
          !result.completed ||
          (member.agent === 'workflow-auditor' &&
            member.verifiedRevision !== revision))
      ) {
        swarm.budget.failedTurns++;
      }
      saveSwarm(this.root, swarm);
      appendPost(
        this.root,
        this.id,
        name,
        `${member.state}: ${member.lastError ?? member.result}`.slice(0, 4000),
      );
      if (swarm.budget.failedTurns >= swarm.budget.maxFailedTurns)
        blockSwarm(this.root, swarm, 'failed-turn');
    } catch (error) {
      const swarm = readSwarm(this.root, this.id);
      const member = swarm.members.find((entry) => entry.name === name)!;
      if (member.state !== 'killed') member.state = 'paused';
      const hadResult = !!member.result || !!member.fullResult;
      recordMemberFailure(
        member,
        error instanceof Error ? error.message : 'Member execution failed.',
      );
      member.verifiedRevision = undefined;
      member.verifiedTree = undefined;
      member.reviewedFiles = undefined;
      if (!hadResult) member.modelsUsed = modelsUsed;
      // Peer cancellation and a blocked task do not spend another failure allowance.
      if (swarm.phase === 'active' && !signal.aborted)
        swarm.budget.failedTurns++;
      saveSwarm(this.root, swarm);
      appendPost(
        this.root,
        this.id,
        name,
        `paused: ${member.lastError}`.slice(0, 4000),
      );
      if (swarm.budget.failedTurns >= swarm.budget.maxFailedTurns)
        blockSwarm(this.root, swarm, 'failed-turn');
    } finally {
      try {
        await release?.();
      } finally {
        releaseQueue?.();
      }
    }
  }
}
export function getSwarmEngine(
  root: string,
  id: string,
  runner: SwarmAgentRunner,
  workspace?: string,
): SwarmEngine {
  const key = engineKey(root, id);
  let engine = engines.get(key);
  if (!engine) {
    engine = new SwarmEngine(root, id, runner);
    engines.set(key, engine);
  }
  if (workspace) engine.bindWorkspace(workspace);
  return engine;
}
export function isSwarmRunning(root: string, id: string): boolean {
  return engines.get(engineKey(root, id))?.hasRunningMembers() ?? false;
}
export function assertSwarmOwnership(root: string, id: string): void {
  owns(readSwarm(root, id).ownerPid);
}
export function requireSwarmWorktree(root: string, id: string): void {
  const swarm = readSwarm(root, id);
  owns(swarm.ownerPid);
  if (!readAgentWorktree(root, id))
    throw new Error('Prepare the worktree first.');
  swarm.worktreeRequired = true;
  saveSwarm(root, swarm);
}
export function postSwarmMessage(
  root: string,
  id: string,
  sender: string,
  text: string,
): void {
  const engine = engines.get(engineKey(root, id));
  if (!engine)
    throw new Error('Resume the swarm in this CLI session before posting.');
  engine.post(sender, text);
}
export function cancelSwarm(root: string, id: string): Swarm {
  const engine = engines.get(engineKey(root, id));
  let swarm: Swarm;
  try {
    swarm = readSwarm(root, id);
  } catch (error) {
    if (!recoverable(error)) throw error;
    engine?.stopMembers();
    if (engine?.hasRunningMembers())
      throw new Error(
        'Cancellation requested; retry /swarm cancel after native members settle. Damaged state remains untouched.',
      );
    return recoverSwarm(root, id);
  }
  owns(swarm.ownerPid);
  engine?.stopMembers();
  if (swarm.phase !== 'completed') {
    swarm.phase = 'cancelled';
    for (const member of swarm.members)
      if (member.state !== 'killed') member.state = 'paused';
  }
  saveSwarm(root, swarm);
  repairPointer(root, swarm);
  return swarm;
}

function repairPointer(root: string, swarm: Swarm): void {
  let pointer: ReturnType<typeof readPointer>;
  try {
    pointer = readPointer(root);
  } catch (error) {
    if (!recoverable(error)) throw error;
    const file = path.join(root, 'swarms/latest.json');
    const backup = `${file}.corrupt-${randomUUID()}`;
    fs.renameSync(file, backup);
    const owner = readOwner(root, swarm.id)!;
    writeJson(path.join(directory(root, swarm.id), 'owner.json'), {
      ...owner,
      bindingRecoveryPath: backup,
    });
    writeJson(file, { id: swarm.id, ownerPid: process.pid });
  }
  if (!pointer || pointer.id === swarm.id)
    writeJson(path.join(root, 'swarms/latest.json'), {
      id: swarm.id,
      ownerPid: process.pid,
    });
}

function recoverSwarm(root: string, id: string): Swarm {
  let owner: ReturnType<typeof readOwner>;
  let ownerDamaged = false;
  try {
    owner = readOwner(root, id);
  } catch (error) {
    if (!recoverable(error)) throw error;
    ownerDamaged = true;
  }
  let pointer: ReturnType<typeof readPointer>;
  try {
    pointer = readPointer(root);
  } catch (error) {
    if (!recoverable(error)) throw error;
  }
  let ownerPid =
    owner?.ownerPid ?? (pointer?.id === id ? pointer.ownerPid : undefined);
  // Older releases stored ownership only in members.json. Recover its validated
  // owner field when the JSON is intact but the member/budget schema is damaged.
  if (!ownerPid) {
    try {
      const prior = z
        .object({ id: z.literal(id), ownerPid: z.number().int().positive() })
        .safeParse(
          readJson(
            path.join(directory(root, id), 'members.json'),
            2 * 1024 * 1024,
          ),
        );
      if (prior.success) ownerPid = prior.data.ownerPid;
    } catch (error) {
      if (!recoverable(error)) throw error;
    }
  }
  if (!ownerPid)
    throw new Error(
      'Cannot verify the owner of this damaged swarm. Restore its owner.json or binding before cancelling.',
    );
  owns(ownerPid);
  const file = path.join(directory(root, id), 'members.json');
  const recoveryPath = fs.existsSync(file)
    ? `${file}.corrupt-${randomUUID()}`
    : owner?.recoveryPath;
  let ownerRecoveryPath = owner?.ownerRecoveryPath;
  if (ownerDamaged) {
    const ownerFile = path.join(directory(root, id), 'owner.json');
    ownerRecoveryPath = `${ownerFile}.corrupt-${randomUUID()}`;
    fs.renameSync(ownerFile, ownerRecoveryPath);
  }
  ownerPid = process.pid;
  // Persist the unknown-usage marker before moving the damaged member record.
  writeJson(
    path.join(directory(root, id), 'owner.json'),
    ownerSchema.parse({
      ...owner,
      id,
      ownerPid,
      budgetVersion: 1,
      accountingUnknown: true,
      recoveryPath,
      ownerRecoveryPath,
    }),
  );
  if (recoveryPath && fs.existsSync(file)) fs.renameSync(file, recoveryPath);
  const swarm = swarmSchema.parse({
    id,
    objective:
      'Cancelled swarm with damaged state; original evidence is retained.',
    ownerPid,
    phase: 'cancelled',
    budgetVersion: 1,
    accountingUnknown: true,
    recoveryPath,
    stopReason: unavailable,
  });
  saveSwarm(root, swarm);
  repairPointer(root, swarm);
  return swarm;
}

/** Explicit local recovery path. A damaged binding never selects an arbitrary old task. */
export function cancelSavedSwarm(root: string, requestedId?: string): Swarm {
  if (requestedId)
    return cancelSwarm(root, z.string().uuid().parse(requestedId));
  const pointer = readPointer(root);
  if (!pointer)
    throw new Error(
      'No saved swarm. Use /swarm cancel <id> if its binding is missing.',
    );
  return cancelSwarm(root, pointer.id);
}

export async function resumeSwarm(root: string, id: string): Promise<void> {
  const engine = engines.get(engineKey(root, id));
  if (engine?.hasRunningMembers())
    throw new Error(
      I18nManager.getInstance().t(
        `成员仍在执行或清理，尚未恢复。请用 /swarm status ${id} 查看状态，收尾结束后再显式 resume。`,
        `Members are still running or cleaning up; no resume started. Inspect /swarm status ${id} and explicitly resume after they settle.`,
      ),
    );
  if (engine) await engine.wait(new AbortController().signal);
  if (readSwarm(root, id).phase === 'completed') return;
  withAgentTaskLock(root, () => resumeSwarmState(root, id));
}
function resumeSwarmState(root: string, id: string): void {
  const swarm = readSwarm(root, id);
  if (swarm.phase === 'completed') return;
  if (swarm.accountingUnknown) throw new Error(unavailable);
  if (hasOpenWorkflowBudget(root))
    throw new Error(
      'Resolve the pending workflow with resume or cancel before resuming a swarm.',
    );
  const current = latestSwarm(root);
  if (
    current &&
    current.id !== id &&
    (['active', 'blocked'].includes(current.phase) ||
      isSwarmRunning(root, current.id))
  )
    throw new Error(
      'Resolve the other pending swarm with finish or cancel before resuming this task.',
    );
  owns(swarm.ownerPid);
  const limit = exhaustedBudget(swarm);
  if (limit)
    throw new Error(
      `Swarm ${limit} budget is still exhausted; /swarm budget must increase the limit before resume.`,
    );
  const resumePost =
    'Explicitly resumed. Mention paused members to continue; killed names remain retired.';
  preparePost(root, id, 'coordinator', resumePost);
  // Do not transfer ownership or rewrite evidence before all refusal checks pass.
  if (swarm.ownerPid !== process.pid)
    for (const member of swarm.members)
      if (['working', 'queued'].includes(member.state)) member.state = 'paused';
  swarm.phase = 'active';
  swarm.stopReason = '';
  swarm.ownerPid = process.pid;
  saveSwarm(root, swarm);
  appendPost(root, id, 'coordinator', resumePost);
  // Main dispatch accounting and coordinator tools resolve this binding.
  writeJson(path.join(root, 'swarms/latest.json'), {
    id: swarm.id,
    ownerPid: process.pid,
  });
}
