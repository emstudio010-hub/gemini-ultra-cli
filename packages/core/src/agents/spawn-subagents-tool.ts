/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { AgentTool } from './agent-tool.js';
import { randomUUID } from 'node:crypto';
import { mapWithConcurrency } from '../utils/asyncPool.js';
import {
  updateCollaborationTask,
  type CollaborationTaskState,
} from './ultraRuntime.js';
import { I18nManager } from '../i18n/i18nManager.js';
import { isSubagentProgress, SubagentState } from './types.js';
import { getMaxParallelSubagents } from './subagentScheduler.js';
export { getMaxParallelSubagents } from './subagentScheduler.js';

export const SPAWN_SUBAGENTS_TOOL_NAME = 'spawn_subagents';
export const DEFAULT_MAX_PARALLEL_SUBAGENTS = 3;

export interface SpawnSubagentTask {
  agent_name?: string;
  prompt: string;
}

export interface SpawnSubagentsParams {
  tasks: SpawnSubagentTask[];
}

class SpawnSubagentsInvocation extends BaseToolInvocation<
  SpawnSubagentsParams,
  ToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: SpawnSubagentsParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Spawn Parallel Subagents');
  }

  getDescription(): string {
    return `Spawning ${this.params.tasks.length} parallel subagent(s)`;
  }

  override async execute(options: ExecuteOptions): Promise<ToolResult> {
    const max = getMaxParallelSubagents();
    const tasks = this.params.tasks;
    const batchId = randomUUID();
    const states: CollaborationTaskState[] = tasks.map((task) => ({
      id: randomUUID(),
      batchId,
      sessionId: this.context.config.getSessionId(),
      agent: task.agent_name || 'generalist',
      status: 'queued',
    }));
    const reportProgress = () => {
      const count = (status: CollaborationTaskState['status']) =>
        states.filter((state) => state.status === status).length;
      options.updateOutput?.(
        I18nManager.getInstance().t(
          `协作任务：排队 ${count('queued')}，执行 ${count('running')}，完成 ${count('completed')}，失败 ${count('failed')}，取消 ${count('cancelled')}`,
          `Tasks: ${count('queued')} queued, ${count('running')} running, ${count('completed')} completed, ${count('failed')} failed, ${count('cancelled')} cancelled`,
        ),
      );
    };
    states.forEach(updateCollaborationTask);
    reportProgress();
    const settled = await mapWithConcurrency(
      tasks,
      max,
      async (task, index): Promise<PromiseSettledResult<ToolResult>> => {
        const state = states[index];
        try {
          options.abortSignal.throwIfAborted();
          const definition = this.context.config
            .getAgentRegistry()
            .getDefinition(task.agent_name || 'generalist');
          if (definition?.kind === 'remote')
            throw new Error(
              'Use invoke_agent for remote agents so endpoint confirmation is handled explicitly. Parallel batches support local agents.',
            );
          const agentTool = new AgentTool(
            this.context,
            this.messageBus,
            undefined,
            () => {
              state.status = 'running';
              state.startedAt = new Date().toISOString();
              updateCollaborationTask(state);
              reportProgress();
            },
          );
          const invocation = agentTool.build({
            agent_name: task.agent_name || 'generalist',
            prompt: task.prompt,
          });
          const value = await invocation.execute({
            abortSignal: options.abortSignal,
          });
          const progress = isSubagentProgress(value.returnDisplay)
            ? value.returnDisplay
            : undefined;
          state.status =
            options.abortSignal.aborted ||
            progress?.state === SubagentState.CANCELLED
              ? 'cancelled'
              : value.error || progress?.state === SubagentState.ERROR
                ? 'failed'
                : 'completed';
          state.error =
            value.error?.message ||
            (state.status === 'failed'
              ? progress?.result ||
                progress?.recentActivity.findLast(
                  (activity) => activity.status === SubagentState.ERROR,
                )?.content ||
                'Subagent execution failed'
              : undefined);
          return { status: 'fulfilled', value };
        } catch (reason) {
          state.status =
            options.abortSignal.aborted ||
            (reason instanceof Error && reason.name === 'AbortError')
              ? 'cancelled'
              : 'failed';
          state.error =
            reason instanceof Error ? reason.message : String(reason);
          return { status: 'rejected', reason };
        } finally {
          state.finishedAt = new Date().toISOString();
          updateCollaborationTask(state);
          reportProgress();
        }
      },
    );

    const sections: string[] = [];
    settled.forEach((res, i) => {
      const name = tasks[i].agent_name || 'generalist';
      const label =
        states[i].status === 'completed'
          ? ''
          : ` ${states[i].status.toUpperCase()}`;
      if (res.status === 'fulfilled') {
        const content =
          typeof res.value.llmContent === 'string'
            ? res.value.llmContent
            : JSON.stringify(res.value.llmContent);
        sections.push(`### Subagent #${i + 1} (${name})${label}\n${content}`);
      } else {
        const msg =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        sections.push(`### Subagent #${i + 1} (${name})${label}\n${msg}`);
      }
    });

    const text = sections.join('\n\n');
    const succeeded = states.filter(
      (state) => state.status === 'completed',
    ).length;
    const failed = states.filter((state) => state.status === 'failed').length;
    const cancelled = states.filter(
      (state) => state.status === 'cancelled',
    ).length;
    const allUnsuccessful = succeeded === 0 && tasks.length > 0;
    return {
      llmContent: text,
      returnDisplay: I18nManager.getInstance().t(
        `已处理 ${tasks.length} 个协作任务：成功 ${succeeded}，失败 ${failed}，取消 ${cancelled}；并发上限 ${max}`,
        `Processed ${tasks.length} tasks: ${succeeded} succeeded, ${failed} failed, ${cancelled} cancelled; concurrency ${max}`,
      ),
      data: { batchId, succeeded, failed, cancelled },
      ...(allUnsuccessful
        ? {
            error: {
              message:
                cancelled === tasks.length
                  ? 'Subagent batch cancelled'
                  : 'No subagent completed successfully',
              type: ToolErrorType.EXECUTION_FAILED,
            },
          }
        : {}),
    };
  }
}

export class SpawnSubagentsTool extends BaseDeclarativeTool<
  SpawnSubagentsParams,
  ToolResult
> {
  static readonly Name = SPAWN_SUBAGENTS_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      SPAWN_SUBAGENTS_TOOL_NAME,
      'Spawn Parallel Subagents',
      `Launch independent subagent tasks with bounded concurrency (up to ${getMaxParallelSubagents()} local agents active across this session, including direct invocations; remaining tasks are queued) and collect every result. Use researcher, coder, reviewer, writer, redteam-analyst or generalist. Assign disjoint files to coding tasks and keep dependent tasks sequential. Each task needs complete context and expected output.`,
      Kind.Agent,
      {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            description: 'Independent tasks, one subagent per task.',
            items: {
              type: 'object',
              properties: {
                agent_name: {
                  type: 'string',
                  description: 'Subagent name (default "generalist").',
                },
                prompt: {
                  type: 'string',
                  minLength: 1,
                  description:
                    'COMPLETE self-contained instructions with all needed context and expected output format.',
                },
              },
              required: ['prompt'],
            },
          },
        },
        required: ['tasks'],
      },
      messageBus,
      true,
      true,
    );
  }

  protected createInvocation(
    params: SpawnSubagentsParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new SpawnSubagentsInvocation(
      this.context,
      params,
      messageBus,
      toolName,
    );
  }
}
