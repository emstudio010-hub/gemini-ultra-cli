/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import {
  createAgentWorkflow,
  readAgentWorkflow,
  saveAgentWorkflow,
  isAgentWorkflowRunning,
  type AgentWorkflow,
} from '../agents/agentWorkflows.js';
import { withAgentTaskLock } from '../agents/agentTaskLock.js';
import {
  activateWorkflowBudget,
  assertWorkflowBudgetOwnership,
  setWorkflowBudget,
} from '../agents/workflowBudget.js';
import { reviewFilesSchema } from '../agents/swarmReviewFiles.js';
import { readDrillGrant } from './drillGrant.js';

export const drillGoalInputSchema = z
  .object({
    objective: z.string().trim().min(1).max(16000),
    template: z
      .enum(['general', 'coding', 'writing', 'audit', 'binary', 'web'])
      .default('general'),
    scope: z.string().trim().max(4000).default(''),
    milestones: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(2000),
            acceptance: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
    reviewFiles: reviewFilesSchema
      .refine(
        (files) =>
          files.every(
            (file) =>
              !/^(?:[a-z]:|[\\/])/i.test(file) &&
              !file
                .split(/[\\/]/)
                .some((part) => part === '..' || part === '.'),
          ) && new Set(files).size === files.length,
        'Use unique workspace-relative deliverable paths.',
      )
      .default(['DRILL-REPORT.md']),
    maxRequests: z.number().int().min(1).max(10000).default(120),
    maxFailedStages: z.number().int().min(1).max(100).default(2),
    maxImplementationRounds: z.number().int().min(1).max(100).default(2),
  })
  .strict();
export type DrillGoalInput = z.input<typeof drillGoalInputSchema>;

const focus: Record<z.infer<typeof drillGoalInputSchema>['template'], string> =
  {
    general: 'Complete the requested deliverable in the current workspace.',
    coding:
      'Implement the scoped change, preserve compatibility, and run only necessary targeted checks.',
    writing:
      'Produce a complete document with consistent structure, supported facts and usable source references.',
    audit:
      'Review authorized local source code. Trace each finding to actual paths and evidence; distinguish verified findings from hypotheses.',
    binary:
      'Statically analyze the user-selected local sample using available native tools. Do not execute the sample. Preserve exact addresses, hashes and tool artifacts; mark unavailable tools honestly.',
    web: 'Assess only the explicitly recorded authorized target scope. Observe the existing drill grant and tool policies; preserve evidence and do not infer permission for unrelated assets.',
  };

function requireGrant(record: Pick<AgentWorkflow, 'drillGoal'>): void {
  if (record.drillGoal?.template === 'web' && !readDrillGrant().granted)
    throw new Error(
      '请先登记演练授权，再创建或续接 Web 演练目标。 / Record drill authorization before creating or resuming a web goal.',
    );
}

/** One durable native Boost record: the cockpit and Agent never own separate progress. */
export function createDrillGoal(
  root: string,
  input: DrillGoalInput,
  previousApprovalMode: string,
  sessionId: string,
): AgentWorkflow {
  const value = drillGoalInputSchema.parse(input);
  if (value.template === 'web' && !value.scope)
    throw new Error(
      '请填写明确的授权目标范围。 / Enter the authorized target scope.',
    );
  const drillGoal = { template: value.template, scope: value.scope, sessionId };
  requireGrant({ drillGoal });
  return withAgentTaskLock(root, () => {
    if (isAgentWorkflowRunning(root))
      throw new Error(
        '当前项目已有工作流执行中。 / A workflow is already running.',
      );
    const record = createAgentWorkflow(
      root,
      'boost',
      value.objective,
      previousApprovalMode,
    );
    record.drillGoal = drillGoal;
    record.reviewFiles = value.reviewFiles;
    record.brief = [
      value.objective,
      focus[value.template],
      value.scope
        ? 'Scope: ' + value.scope
        : 'Scope: current project workspace.',
      'Preserve the original objective and explicit user constraints across every milestone and resume.',
      'Use the existing configured model, enabled skills, prompt/rule settings, collaboration controls, drill grant, facts and patch transaction tools where applicable. Never expand authorization or enable bypass on your own.',
      'Keep evidence and outcomes in the declared deliverables: ' +
        JSON.stringify(value.reviewFiles),
      'Only necessary relevant validation. Do not run redundant full or smoke suites. Report actual commands and outcomes; never claim a fixture, build or partial artifact proves live acceptance.',
    ].join('\n');
    record.milestones = (
      value.milestones ?? [
        {
          title: '调查与范围 / Investigate and scope',
          acceptance:
            'Inspect actual sources or inputs, record scope, dependencies and a concrete bounded implementation plan in the declared report.',
        },
        {
          title: '实现与交付 / Implement and deliver',
          acceptance:
            'Complete the requested functional deliverables using the investigation evidence. Preserve user changes and produce the declared report with actual artifact paths.',
        },
        {
          title: '必要验证与总结 / Verify and hand off',
          acceptance:
            'Run only the necessary checks for this task. Update the declared report with actual results, remaining limits and a usable handoff. Deliver requested packages when packaging is part of the objective.',
        },
      ]
    ).map((item) => ({ ...item, completed: false }));
    saveAgentWorkflow(root, record);
    setWorkflowBudget(root, record, {
      maxRequests: value.maxRequests,
      maxFailedStages: value.maxFailedStages,
      maxImplementationRounds: value.maxImplementationRounds,
    });
    return readAgentWorkflow(root, record.id);
  });
}

/** Explicit local resume only. Completed goals return locally without another model request. */
export function prepareDrillGoalResume(
  root: string,
  id: string,
): string | undefined {
  return withAgentTaskLock(root, () => {
    const record = readAgentWorkflow(root, id);
    if (!record.drillGoal || record.mode !== 'boost')
      throw new Error(
        '这不是演练台目标，请使用任务对应的原生命令。 / Use the native command for this task.',
      );
    if (record.phase === 'completed') return undefined;
    requireGrant(record);
    if (isAgentWorkflowRunning(root))
      throw new Error(
        '请等待运行中的子任务完成收尾。 / Wait for running children to settle.',
      );
    assertWorkflowBudgetOwnership(root, record);
    activateWorkflowBudget(root, record);
    record.phase = 'ready';
    saveAgentWorkflow(root, record);
    return drillGoalExecutionPrompt(record);
  });
}

export function drillGoalExecutionPrompt(record: AgentWorkflow): string {
  return [
    'Execute this saved drill goal using run_agent_workflow. Do not create another workflow or ad hoc batch.',
    'workflow_id=' + record.id,
    'review_files=' + JSON.stringify(record.reviewFiles ?? []),
    'The native engine owns persisted milestones, sequential implementation, independent review, cumulative request limits and cancellation. Continue incomplete milestones until the goal is accepted or genuinely blocked.',
    'A blocked/cancelled run is not completion. Preserve results and the exact remaining requirement. Do not automatically retry or reset usage; an explicit user resume is required.',
    'Objective: ' + record.objective,
    'Agreed plan and constraints:\n' + record.brief,
    'Milestones:\n' + JSON.stringify(record.milestones),
  ].join('\n');
}
