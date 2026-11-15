/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ApprovalMode } from '../policy/types.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ExecuteOptions,
  type ToolResult,
} from '../tools/tools.js';
import { listAgentTasks } from '../agents/agentTaskCatalog.js';
import { readAgentTaskDetails } from '../agents/agentTaskDetails.js';
import {
  createDrillGoal,
  drillGoalExecutionPrompt,
  type DrillGoalInput,
} from './drillGoals.js';

interface Params {
  action: 'create' | 'status' | 'list';
  id?: string;
  objective?: string;
  template?: DrillGoalInput['template'];
  scope?: string;
  milestones?: DrillGoalInput['milestones'];
  reviewFiles?: string[];
  page?: number;
}
class Invocation extends BaseToolInvocation<Params, ToolResult> {
  constructor(
    private readonly context: AgentLoopContext,
    params: Params,
    bus: MessageBus,
  ) {
    super(params, bus);
  }
  getDescription(): string {
    return 'Manage a saved drill goal';
  }
  async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    abortSignal.throwIfAborted();
    this.context.config.getLifecycleSignal().throwIfAborted();
    const config = this.context.config;
    const root = config.storage.getProjectTempDir();
    if (this.params.action === 'list') {
      return {
        llmContent: JSON.stringify(listAgentTasks(root, this.params.page ?? 1)),
        returnDisplay: 'Saved project goals and native tasks',
      };
    }
    if (this.params.action === 'status') {
      const data = readAgentTaskDetails(root, {
        mode: 'boost',
        id: this.params.id,
      });
      return {
        llmContent: JSON.stringify(data),
        returnDisplay: 'Goal: ' + data.phase,
      };
    }
    if (config.getApprovalMode() === ApprovalMode.PLAN)
      throw new Error('Leave Plan Mode before creating an executable goal.');
    if (!this.params.objective)
      throw new Error('An explicit objective is required.');
    const record = createDrillGoal(
      root,
      {
        objective: this.params.objective,
        template: this.params.template,
        scope: this.params.scope,
        milestones: this.params.milestones,
        reviewFiles: this.params.reviewFiles,
      },
      config.getApprovalMode(),
      config.getSessionId(),
    );
    return {
      llmContent:
        'Goal saved, not executed. When execution is authorized by the user, follow:\n' +
        drillGoalExecutionPrompt(record),
      returnDisplay: 'Saved drill goal: ' + record.id,
      data: { goalId: record.id, phase: record.phase },
    };
  }
}
export class ManageDrillGoalTool extends BaseDeclarativeTool<
  Params,
  ToolResult
> {
  static readonly Name = 'manage_drill_goal';
  constructor(
    private readonly context: AgentLoopContext,
    bus: MessageBus,
  ) {
    super(
      ManageDrillGoalTool.Name,
      'Manage Drill Goal',
      'Create a durable native Boost goal for an explicitly requested task, or inspect saved project tasks. Goals persist milestones, acceptance criteria, reports and cumulative usage in the same records shown by /goal and the Drill Cockpit. Creation alone never dispatches a model. Use run_agent_workflow to execute a newly created authorized goal. A blocked/cancelled goal needs explicit user resume; never create duplicates to bypass limits. Do not create nested goals from workflow workers. Only the user may change request limits.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'status', 'list'] },
          id: { type: 'string', description: 'Saved goal UUID for status.' },
          objective: { type: 'string', maxLength: 16000 },
          template: {
            type: 'string',
            enum: ['general', 'coding', 'writing', 'audit', 'binary', 'web'],
          },
          scope: { type: 'string', maxLength: 4000 },
          reviewFiles: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 64,
            description:
              'Workspace-relative final files. Defaults to DRILL-REPORT.md; use [] only for reports-only work.',
          },
          milestones: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                acceptance: { type: 'string' },
              },
              required: ['title', 'acceptance'],
              additionalProperties: false,
            },
          },
          page: { type: 'integer', minimum: 1, maximum: 1000000 },
        },
        required: ['action'],
        additionalProperties: false,
      },
      bus,
    );
  }
  protected createInvocation(params: Params, bus: MessageBus): Invocation {
    return new Invocation(this.context, params, bus);
  }
}
