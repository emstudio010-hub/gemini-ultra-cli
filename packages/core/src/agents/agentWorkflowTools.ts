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
import { ToolErrorType } from '../tools/tool-error.js';
import { AgentTool } from './agent-tool.js';
import { localAgentOutcome } from './local-agent-outcome.js';
import {
  readAgentWorkflow,
  saveAgentWorkflow,
  runAgentWorkflow,
  workflowPlanSchema,
  isAgentWorkflowRunning,
  agentWorkflowSummary,
} from './agentWorkflows.js';
import { assertWorkflowBudgetOwnership } from './workflowBudget.js';

interface DraftParams {
  workflow_id: string;
  brief: string;
  milestones: Array<{ title: string; acceptance: string }>;
}
class DraftInvocation extends BaseToolInvocation<DraftParams, ToolResult> {
  getDescription(): string {
    return 'Save the scoped workflow draft';
  }
  constructor(
    private readonly context: AgentLoopContext,
    params: DraftParams,
    messageBus: MessageBus,
  ) {
    super(params, messageBus);
  }
  async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    abortSignal.throwIfAborted();
    const root = this.context.config.storage.getProjectTempDir();
    if (isAgentWorkflowRunning(root))
      throw new Error('A workflow is executing in this workspace.');
    const record = readAgentWorkflow(root, this.params.workflow_id);
    assertWorkflowBudgetOwnership(root, record);
    if (!['scoping', 'ready'].includes(record.phase) || record.approved)
      throw new Error('Only an unapproved scoping record can be drafted.');
    const plan = workflowPlanSchema.parse(this.params);
    record.brief = plan.brief;
    record.milestones = plan.milestones.map((milestone) => ({
      ...milestone,
      completed: false,
    }));
    record.phase = 'ready';
    saveAgentWorkflow(root, record);
    const next =
      record.mode === 'grill-me' ? '/grill-me finish' : '/teamwork approve';
    return {
      llmContent: `Draft saved; execution has NOT been approved. Present the agreed brief, milestone acceptance criteria and the command ${next}. Wait for the user; do not call run_agent_workflow or implement changes.\n${JSON.stringify(agentWorkflowSummary(root, record))}`,
      returnDisplay: `Draft saved: ${record.id}. ${next}`,
    };
  }
}
export class DraftAgentWorkflowTool extends BaseDeclarativeTool<
  DraftParams,
  ToolResult
> {
  static readonly Name = 'draft_agent_workflow';
  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      DraftAgentWorkflowTool.Name,
      'Draft Agent Workflow',
      'Save an agreed brief and milestone acceptance criteria for a workflow created by /teamwork or /grill-me. Writes only internal workflow state; cannot approve execution.',
      Kind.Plan,
      {
        type: 'object',
        properties: {
          workflow_id: {
            type: 'string',
            description: 'ID returned by the slash command.',
          },
          brief: { type: 'string', maxLength: 16000 },
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
        },
        required: ['workflow_id', 'brief', 'milestones'],
        additionalProperties: false,
      },
      messageBus,
    );
  }
  protected createInvocation(
    params: DraftParams,
    bus: MessageBus,
  ): DraftInvocation {
    return new DraftInvocation(this.context, params, bus);
  }
}

interface RunParams {
  workflow_id: string;
  review_files: string[];
}
class RunInvocation extends BaseToolInvocation<RunParams, ToolResult> {
  constructor(
    private readonly context: AgentLoopContext,
    params: RunParams,
    bus: MessageBus,
  ) {
    super(params, bus);
  }
  getDescription(): string {
    return 'Run the approved agent workflow';
  }
  async execute(options: ExecuteOptions): Promise<ToolResult> {
    if (this.context.config.getApprovalMode() === ApprovalMode.PLAN)
      throw new Error(
        'Workflow execution is unavailable in plan mode. Approve the scoped workflow first.',
      );
    const root = this.context.config.storage.getProjectTempDir();
    const record = await runAgentWorkflow(
      root,
      this.params.workflow_id,
      options.abortSignal,
      async (agent, prompt, signal) => {
        const definition = this.context.config
          .getAgentRegistry()
          .getDefinition(agent);
        if (definition?.kind !== 'local')
          throw new Error(
            `Required local workflow agent is unavailable: ${agent}`,
          );
        const result = await new AgentTool(this.context, this.messageBus)
          .build({ agent_name: agent, prompt })
          .execute({ abortSignal: signal, updateOutput: options.updateOutput });
        return localAgentOutcome(result, agent !== 'workflow-auditor');
      },
      options.updateOutput,
      {
        workspace: this.context.config.getTargetDir(),
        files: this.params.review_files,
      },
    );
    return {
      llmContent: `${JSON.stringify(agentWorkflowSummary(root, record))}\nIntegrate the reports into the requested deliverable. A blocked/cancelled workflow is not complete; preserve partial results and describe the exact remaining requirement. Do not automatically relaunch blocked work; the user can explicitly resume it.`,
      returnDisplay: `${record.mode}: ${record.phase} (${record.milestones.filter((item) => item.completed).length}/${record.milestones.length})`,
      data: { workflowId: record.id, phase: record.phase },
      ...(record.phase !== 'completed'
        ? {
            error: {
              type: ToolErrorType.EXECUTION_FAILED,
              message: record.stage,
            },
          }
        : {}),
    };
  }
}
export class RunAgentWorkflowTool extends BaseDeclarativeTool<
  RunParams,
  ToolResult
> {
  static readonly Name = 'run_agent_workflow';
  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      RunAgentWorkflowTool.Name,
      'Run Agent Workflow',
      'Execute a ready, explicitly approved /boost or /teamwork workflow. Runs independent investigations, serial implementation and structured read-only review, with cumulative per-milestone implementation rounds and a final independent audit. Model dispatches, failed stages and implementation rounds persist across resumes. Only the user can change limits with the local budget command. A blocked task requires explicit resume; do not bypass its limits with ad hoc worker batches. Persists progress; cannot approve scoping records.',
      Kind.Agent,
      {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          review_files: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 1024 },
            maxItems: 64,
            uniqueItems: true,
            description:
              'List every final deliverable and evidence file to inspect inside the task workspace (or managed worktree); at most 64 MiB total. Files may be created by later milestones and are checked only before/after the final integrated audit. Use [] only for member-report-only tasks with no workspace-file deliverables; that scope does not approve workspace files. On explicit resume, declare the current required final file list again.',
          },
        },
        required: ['workflow_id', 'review_files'],
        additionalProperties: false,
      },
      messageBus,
      true,
      true,
    );
  }
  protected createInvocation(
    params: RunParams,
    bus: MessageBus,
  ): RunInvocation {
    return new RunInvocation(this.context, params, bus);
  }
}
