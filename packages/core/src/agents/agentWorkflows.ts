/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lock, checkSync } from 'proper-lockfile';
import { z } from 'zod';
import { latestSwarm, assertNoPendingSwarm } from './swarm.js';
import { workflowContext, workflowMilestoneTitle } from './workflowContext.js';
import {
  saveWorkflowReportText,
  workflowReportArchivePath,
  workflowReportArchiveSchema,
} from './workflowReportText.js';
import {
  inAgentWorktree,
  readAgentWorktree,
  acceptReviewedAgentWorktree,
  agentWorktreeTree,
} from './agentWorktree.js';
import {
  agentRoleModelsSchema,
  normalizeAgentModel,
  workflowRoleSchema,
  withAgentModel,
} from './agentModelRouting.js';
import {
  workflowBudget,
  workflowBudgetSummary,
  activateWorkflowBudget,
  assertWorkflowBudget,
  assertWorkflowBudgetOwnership,
  closeWorkflowBudget,
  failWorkflowStage,
  hasOpenWorkflowBudget,
  reserveWorkflowRound,
  withWorkflowBudget,
  readWorkflowBudgetById,
  markWorkflowRecordUnavailable,
  currentWorkflowBudget,
} from './workflowBudget.js';

const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(2000),
  acceptance: z.string().trim().min(1).max(4000),
  completed: z.boolean().default(false),
});
export const workflowPlanSchema = z.object({
  brief: z.string().trim().min(1).max(16000),
  milestones: z.array(milestoneSchema).min(1).max(12),
});
const workflowSchema = workflowPlanSchema.extend({
  id: z.string().uuid(),
  mode: z.enum(['boost', 'teamwork', 'grill-me']),
  objective: z.string().trim().min(1).max(16000),
  phase: z.enum([
    'scoping',
    'ready',
    'running',
    'blocked',
    'completed',
    'cancelled',
  ]),
  previousApprovalMode: z.string(),
  approved: z.boolean().default(false),
  budgetVersion: z.literal(1).optional(),
  budgetOwnerPid: z.number().int().positive().optional(),
  budgetUnavailable: z.boolean().optional(),
  budgetRecoveryPath: z.string().optional(),
  recordUnavailable: z.boolean().optional(),
  recordRecoveryPath: z.string().optional(),
  roleModels: agentRoleModelsSchema.default({}),
  worktreeRequired: z.boolean().default(false),
  updatedAt: z.string(),
  stage: z.string().default(''),
  reports: z
    .array(
      z.object({
        agent: z.string(),
        stage: z.string(),
        completed: z.boolean(),
        text: z.string().max(16000),
        fullText: workflowReportArchiveSchema.optional(),
        modelsUsed: z.array(z.string().max(512)).max(16).optional(),
      }),
    )
    .max(100)
    .default([]),
});
export type AgentWorkflow = z.infer<typeof workflowSchema>;
export type AgentWorkflowMode = AgentWorkflow['mode'];
class DamagedWorkflowRecordError extends Error {}
function missingRecord(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
function damagedRecord(error: unknown): boolean {
  return error instanceof DamagedWorkflowRecordError || missingRecord(error);
}
export type WorkflowAgentResult = { completed: boolean; text: string };
export type WorkflowAgentRunner = (
  agent: 'researcher' | 'coder' | 'workflow-auditor',
  prompt: string,
  signal: AbortSignal,
) => Promise<WorkflowAgentResult>;

function workflowDir(projectTempDir: string): string {
  return path.join(projectTempDir, 'agent-workflows');
}
function workflowPath(projectTempDir: string, id: string): string {
  z.string().uuid().parse(id);
  return path.join(workflowDir(projectTempDir), `${id}.json`);
}
export function agentWorkflowSummary(
  projectTempDir: string,
  record: AgentWorkflow,
) {
  return {
    id: record.id,
    mode: record.mode,
    phase: record.phase,
    stage: record.stage,
    objective: record.objective,
    milestones: record.milestones,
    recordPath: workflowPath(projectTempDir, record.id),
    reportCount: record.reports.length,
    roleModels: record.roleModels,
    worktree: readAgentWorktree(projectTempDir, record.id),
    recentReports: record.reports.slice(-4).map((report) => ({
      ...report,
      text: report.text.slice(0, 4000),
      truncated: !!report.fullText || report.text.length > 4000,
      ...(report.fullText
        ? {
            fullReport: workflowReportArchivePath(
              projectTempDir,
              record.id,
              report.fullText,
            ),
          }
        : {}),
    })),
    budget: workflowBudgetSummary(projectTempDir, record),
  };
}
export function readAgentWorkflow(
  projectTempDir: string,
  id: string,
): AgentWorkflow {
  const file = workflowPath(projectTempDir, id);
  // The bounded 100 reports may contain multibyte text (up to ~7 MiB total).
  if (fs.statSync(file).size > 8 * 1024 * 1024)
    throw new DamagedWorkflowRecordError(
      `Workflow record ${id} is too large; use a local cancel command with this ID to preserve it.`,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new DamagedWorkflowRecordError(
        `Workflow record ${id} is damaged; cancel it locally by ID.`,
      );
    throw error;
  }
  const parsed = workflowSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== id)
    throw new DamagedWorkflowRecordError(
      `Workflow record ${id} is invalid; cancel it locally by ID.`,
    );
  return parsed.data;
}
export function saveAgentWorkflow(
  projectTempDir: string,
  value: AgentWorkflow,
): void {
  const next = workflowSchema.parse({
    ...value,
    updatedAt: new Date().toISOString(),
  });
  const file = workflowPath(projectTempDir, next.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
export function latestAgentWorkflow(
  projectTempDir: string,
  mode: AgentWorkflowMode,
  onDamaged?: (id: string) => void,
): AgentWorkflow | undefined {
  const directory = workflowDir(projectTempDir);
  if (!fs.existsSync(directory)) return undefined;
  const records: AgentWorkflow[] = [];
  for (const file of fs
    .readdirSync(directory)
    .filter((file) => /^[\da-f-]{36}\.json$/i.test(file))) {
    const id = file.slice(0, -5);
    try {
      const record = readAgentWorkflow(projectTempDir, id);
      if (record.mode === mode) records.push(record);
    } catch (error) {
      if (!damagedRecord(error)) throw error;
      onDamaged?.(id);
      // A damaged active task of this mode must not silently fall back to an old one.
      const current = currentWorkflowBudget(projectTempDir);
      if (
        current?.id === id &&
        current.mode === mode &&
        current.state !== 'closed'
      )
        throw new Error(
          `Workflow record ${id} is damaged. Use /${mode} cancel ${id}; older tasks were not selected.`,
        );
    }
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
export function createAgentWorkflow(
  projectTempDir: string,
  mode: AgentWorkflowMode,
  objective: string,
  previousApprovalMode: string,
): AgentWorkflow {
  if (
    hasOpenWorkflowBudget(projectTempDir) ||
    ['active', 'blocked'].includes(latestSwarm(projectTempDir)?.phase ?? '')
  )
    throw new Error(
      'Resolve the pending workflow or swarm with resume or cancel before creating another task.',
    );
  // A cancelled swarm may still have a local writer settling its last turn.
  assertNoPendingSwarm(projectTempDir);
  const record = workflowSchema.parse({
    id: randomUUID(),
    mode,
    objective,
    previousApprovalMode,
    brief: objective,
    milestones: [
      {
        title: objective.slice(0, 2000),
        acceptance:
          'Deliver the requested outcome, honor the user constraints, and report concrete evidence and remaining limitations.',
      },
    ],
    phase: mode === 'boost' ? 'ready' : 'scoping',
    approved: mode === 'boost',
    updatedAt: new Date().toISOString(),
  });
  saveAgentWorkflow(projectTempDir, record);
  activateWorkflowBudget(projectTempDir, record);
  return record;
}

const active = new Map<string, { id: string; controller: AbortController }>();
/** Local user configuration only; execution state and cumulative counters are retained. */
export function setWorkflowRoleModel(
  root: string,
  id: string,
  target: string,
  modelSpec: string,
): void {
  if (isAgentWorkflowRunning(root))
    throw new Error(
      'Wait for the running workflow to settle before changing member models.',
    );
  const record = readAgentWorkflow(root, id);
  assertWorkflowBudgetOwnership(root, record);
  if (record.recordUnavailable || record.budgetUnavailable)
    throw new Error(
      'Unavailable task records cannot change member models. Create a scoped successor.',
    );
  if (record.phase === 'completed')
    throw new Error('A completed workflow cannot change member models.');
  const role = workflowRoleSchema.parse(target);
  record.roleModels[role] = normalizeAgentModel(modelSpec);
  saveAgentWorkflow(root, record);
}
export function isAgentWorkflowRunning(projectTempDir: string): boolean {
  const directory = workflowDir(projectTempDir);
  return (
    active.has(directory) ||
    (fs.existsSync(directory) && checkSync(directory, { realpath: false }))
  );
}
export function cancelAgentWorkflow(
  projectTempDir: string,
  id: string,
  expectedMode?: AgentWorkflowMode,
): AgentWorkflow {
  let record: AgentWorkflow;
  try {
    record = readAgentWorkflow(projectTempDir, id);
  } catch (error) {
    if (!damagedRecord(error)) throw error;
    const running = active.get(workflowDir(projectTempDir));
    if (running) {
      if (running.id === id) running.controller.abort();
      throw new Error(
        'A native workflow is running; retry local cancellation after its children settle. The damaged record was retained.',
      );
    }
    if (isAgentWorkflowRunning(projectTempDir))
      throw new Error(
        'Workflow is running in another CLI process; cancel it from that session.',
      );
    const budget = readWorkflowBudgetById(projectTempDir, id);
    if (expectedMode && budget.mode !== expectedMode)
      throw new Error(
        `This ID belongs to /${budget.mode}; use /${budget.mode} cancel ${id}.`,
      );
    const file = workflowPath(projectTempDir, id);
    const recoveryPath = fs.existsSync(file)
      ? `${file}.corrupt-${randomUUID()}`
      : budget.recordRecoveryPath;
    // Marker is stored in the independent ledger before moving any evidence.
    markWorkflowRecordUnavailable(projectTempDir, id, recoveryPath);
    if (recoveryPath && fs.existsSync(file)) fs.renameSync(file, recoveryPath);
    record = workflowSchema.parse({
      id,
      mode: budget.mode,
      objective:
        'Cancelled workflow with unavailable original record; see retained artifacts.',
      brief:
        'Original requirements and reports are retained in the recovery artifact; no completion is inferred.',
      milestones: [
        {
          title: 'Original task was cancelled',
          acceptance: 'No deliverable was accepted.',
        },
      ],
      phase: 'cancelled',
      previousApprovalMode: 'default',
      approved: false,
      budgetVersion: 1,
      budgetOwnerPid: process.pid,
      recordUnavailable: true,
      recordRecoveryPath: recoveryPath,
      updatedAt: new Date().toISOString(),
      stage:
        'Original workflow record unavailable; create a scoped successor task.',
    });
    saveAgentWorkflow(projectTempDir, record);
  }
  if (expectedMode && record.mode !== expectedMode)
    throw new Error(
      `This ID belongs to /${record.mode}; use /${record.mode} cancel ${id}.`,
    );
  if (active.has(workflowDir(projectTempDir))) {
    // The runner owns state until its children have settled.
    const running = active.get(workflowDir(projectTempDir))!;
    if (running.id !== id)
      throw new Error('Another workflow is running in this workspace.');
    running.controller.abort();
    return record;
  }
  if (isAgentWorkflowRunning(projectTempDir))
    throw new Error(
      'Workflow is running in another CLI process; cancel it from that session.',
    );
  closeWorkflowBudget(projectTempDir, record, true);
  if (record.phase !== 'completed') record.phase = 'cancelled';
  saveAgentWorkflow(projectTempDir, record);
  return record;
}

const verdictSchema = z.object({
  passed: z.boolean(),
  summary: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
});
function reviewPassed(result: WorkflowAgentResult): boolean {
  if (!result.completed) return false;
  try {
    return verdictSchema.parse(JSON.parse(result.text)).passed;
  } catch {
    return false;
  }
}

/** Native, bounded execution. Only read-only investigations run concurrently. */
export async function runAgentWorkflow(
  projectTempDir: string,
  id: string,
  signal: AbortSignal,
  runAgent: WorkflowAgentRunner,
  onProgress?: (message: string) => void,
): Promise<AgentWorkflow> {
  assertNoPendingSwarm(projectTempDir);
  const directory = workflowDir(projectTempDir);
  fs.mkdirSync(directory, { recursive: true });
  // Also prevents separate CLI processes from running writers in this workspace.
  const release = await lock(directory, { realpath: false, retries: 0 });
  const controller = new AbortController();
  const combined = AbortSignal.any([
    signal,
    controller.signal,
    AbortSignal.timeout(20 * 60 * 1000),
  ]);
  let record: AgentWorkflow | undefined;
  try {
    record = readAgentWorkflow(projectTempDir, id);
    if (
      record.mode === 'grill-me' ||
      !record.approved ||
      record.phase !== 'ready'
    ) {
      throw new Error(
        'Workflow must be approved and ready. Use the slash command to approve or resume it.',
      );
    }
    combined.throwIfAborted();
    assertWorkflowBudgetOwnership(projectTempDir, record);
    active.set(directory, { id, controller });
    record.phase = 'running';
    const current = record;
    workflowBudget(projectTempDir, current);
    assertWorkflowBudget(projectTempDir, id);
    activateWorkflowBudget(projectTempDir, current);
    return await withWorkflowBudget(
      projectTempDir,
      id,
      controller,
      async () => {
        const persist = () => {
          // A concurrent disk failure must not be hidden by overwriting the only
          // original record with the runner's older in-memory copy.
          readAgentWorkflow(projectTempDir, id);
          saveAgentWorkflow(projectTempDir, current);
        };
        const context = () => workflowContext(projectTempDir, current);
        const stage = async (
          agent: Parameters<WorkflowAgentRunner>[0],
          title: string,
          instruction: string,
        ) => {
          combined.throwIfAborted();
          assertWorkflowBudget(projectTempDir, id);
          current.stage = title;
          persist();
          onProgress?.(`${current.mode}: ${title}`);
          let result: WorkflowAgentResult;
          let modelsUsed: string[] = [];
          try {
            result = await withAgentModel(
              current.roleModels[agent],
              () =>
                inAgentWorktree(
                  projectTempDir,
                  id,
                  (directory) =>
                    runAgent(
                      agent,
                      `${directory ? `ISOLATED TASK WORKTREE: ${directory}. Resolve all assigned repository files relative to this directory. Do not edit the source checkout. Dependencies ignored by Git are not copied. This is a working-directory boundary, not an OS sandbox.\n` : ''}${context()}\n\nAssignment: ${instruction}`,
                      combined,
                    ),
                  current.worktreeRequired,
                ),
              (models) => {
                modelsUsed = models;
              },
            );
          } catch (error) {
            result = {
              completed: false,
              text:
                error instanceof Error
                  ? error.message
                  : 'Agent execution failed.',
            };
          }
          const stopped = workflowBudget(projectTempDir, current).stopReason;
          if (combined.aborted && stopped)
            result = {
              completed: false,
              text: `${stopped}\nMember diagnostic: ${result.text}`,
            };
          let savedText: ReturnType<typeof saveWorkflowReportText>;
          try {
            savedText = saveWorkflowReportText(projectTempDir, id, result.text);
          } catch (error) {
            result = {
              completed: false,
              text: `Stage report archive failed: ${error instanceof Error ? error.message : 'storage error'}`,
            };
            savedText = { text: result.text };
          }
          current.reports.push({
            agent,
            stage: title,
            completed: result.completed,
            modelsUsed,
            ...savedText,
          });
          current.reports = current.reports.slice(-100);
          persist();
          if (
            !combined.aborted &&
            (!result.completed ||
              (agent === 'workflow-auditor' && !reviewPassed(result)))
          )
            failWorkflowStage(projectTempDir, id);
          combined.throwIfAborted();
          return result;
        };
        persist();
        for (let index = 0; index < current.milestones.length; index++) {
          const milestone = current.milestones[index];
          if (milestone.completed) continue;
          assertWorkflowBudget(projectTempDir, id, index);
          const assignment = `Milestone ${index + 1}: ${workflowMilestoneTitle(current, milestone.title)}\nAcceptance: ${milestone.acceptance}`;
          // Await every launched child, including after failures, before releasing the workspace lock.
          const investigations = await Promise.allSettled(
            (current.mode === 'boost'
              ? [
                  'Trace the leading root-cause hypothesis.',
                  'Independently investigate an alternative explanation and challenge the leading hypothesis.',
                ]
              : [
                  'Locate relevant code and propose a bounded implementation plan.',
                ]
            ).map((focus, n) =>
              stage(
                'researcher',
                `investigate ${index + 1}.${n + 1}`,
                `${assignment}\n${focus} Read only. Return evidence and handoff; do not implement.`,
              ),
            ),
          );
          combined.throwIfAborted();
          if (
            investigations.every(
              (result) =>
                result.status === 'rejected' || !result.value.completed,
            )
          ) {
            throw new Error(
              'Investigations did not complete; partial evidence is retained.',
            );
          }
          let accepted = false;
          while (!accepted) {
            const round = reserveWorkflowRound(projectTempDir, id, index);
            const implemented = await stage(
              'coder',
              `implement ${index + 1}.${round}`,
              `${assignment}\nImplement or correct the scoped milestone using available evidence and any review failures. Return changed paths, actual check commands/outcomes, and remaining limitations. Do not mark the whole workflow complete.`,
            );
            if (!implemented.completed)
              throw new Error(
                'Implementation interrupted; retained partial result needs explicit resume.',
              );
            const review = await stage(
              'workflow-auditor',
              `review ${index + 1}.${round}`,
              `${assignment}\nIndependently inspect the actual files and evidence. Check deliverables against acceptance, not the writer's confidence. Return structured passed, summary, evidence via complete_task. Unsupported evidence, missing deliverables, or unverified required checks must fail. Do not modify files.`,
            );
            accepted = reviewPassed(review);
            if (
              !accepted &&
              round >=
                workflowBudget(projectTempDir, current).maxImplementationRounds
            )
              assertWorkflowBudget(projectTempDir, id, index);
          }
          milestone.completed = true;
          persist();
        }
        const finalReviewTree = agentWorktreeTree(projectTempDir, id);
        const audit = await stage(
          'workflow-auditor',
          'final audit',
          `Audit the integrated deliverable against the original objective and every milestone:\n${JSON.stringify(current.milestones.map((milestone) => ({ ...milestone, title: workflowMilestoneTitle(current, milestone.title) })))}\nRead actual artifacts. Passing individual stages is insufficient. Report structured passed, summary, evidence through complete_task; fail any unmet or unverified explicit requirement. Do not modify files.`,
        );
        if (!reviewPassed(audit)) {
          current.milestones[current.milestones.length - 1].completed = false;
          throw new Error(
            'Final independent audit did not accept the deliverable.',
          );
        }
        acceptReviewedAgentWorktree(projectTempDir, id, finalReviewTree);
        current.phase = 'completed';
        current.stage = 'completed';
        persist();
        closeWorkflowBudget(projectTempDir, current);
        return current;
      },
    );
  } catch (error) {
    if (!record || record.phase !== 'running') throw error;
    const budget = workflowBudget(projectTempDir, record);
    record.phase = budget.stopReason
      ? 'blocked'
      : signal.aborted || controller.signal.aborted
        ? 'cancelled'
        : 'blocked';
    record.stage =
      budget.stopReason ||
      (error instanceof Error ? error.message : 'Workflow execution failed.');
    readAgentWorkflow(projectTempDir, id);
    saveAgentWorkflow(projectTempDir, record);
    if (record.phase === 'cancelled')
      closeWorkflowBudget(projectTempDir, record, true);
    return record;
  } finally {
    active.delete(directory);
    await release();
  }
}
