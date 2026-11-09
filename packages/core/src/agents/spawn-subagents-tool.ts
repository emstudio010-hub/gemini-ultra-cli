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

export const SPAWN_SUBAGENTS_TOOL_NAME = 'spawn_subagents';
export const DEFAULT_MAX_PARALLEL_SUBAGENTS = 3;
const HARD_MAX_PARALLEL_SUBAGENTS = 8;

/** Max parallel subagents per call. Override with GEMINI_ULTRA_MAX_PARALLEL_SUBAGENTS (1-8). */
export function getMaxParallelSubagents(): number {
  const raw = Number(process.env['GEMINI_ULTRA_MAX_PARALLEL_SUBAGENTS']);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(Math.floor(raw), HARD_MAX_PARALLEL_SUBAGENTS);
  }
  return DEFAULT_MAX_PARALLEL_SUBAGENTS;
}

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
    const tasks = this.params.tasks.slice(0, max);
    const dropped = this.params.tasks.length - tasks.length;
    const agentTool = new AgentTool(this.context, this.messageBus);

    const settled = await Promise.allSettled(
      tasks.map(async (task) => {
        const invocation = agentTool.build({
          agent_name: task.agent_name || 'generalist',
          prompt: task.prompt,
        });
        return invocation.execute({ abortSignal: options.abortSignal });
      }),
    );

    const sections: string[] = [];
    let failures = 0;
    settled.forEach((res, i) => {
      const name = tasks[i].agent_name || 'generalist';
      if (res.status === 'fulfilled') {
        const content =
          typeof res.value.llmContent === 'string'
            ? res.value.llmContent
            : JSON.stringify(res.value.llmContent);
        if (res.value.error) failures++;
        sections.push(`### Subagent #${i + 1} (${name})\n${content}`);
      } else {
        failures++;
        const msg =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        sections.push(`### Subagent #${i + 1} (${name}) FAILED\n${msg}`);
      }
    });

    if (dropped > 0) {
      sections.push(
        `> ${dropped} task(s) were not run: limit is ${max} parallel subagents per call. Re-issue them in a follow-up call.`,
      );
    }

    const text = sections.join('\n\n');
    const allFailed = failures === tasks.length && tasks.length > 0;
    return {
      llmContent: text,
      returnDisplay: `✦ 已并行运行 ${tasks.length} 个子代理 (成功 ${tasks.length - failures} / 失败 ${failures})${dropped > 0 ? `，${dropped} 个超出上限未运行` : ''}`,
      ...(allFailed
        ? {
            error: {
              message: 'All subagents failed',
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
      `Launch several independent subagents IN PARALLEL (up to ${getMaxParallelSubagents()} per call) and collect all their results. Use for independent sub-problems (e.g. investigate module A / module B / write tests). Each task needs a complete, self-contained prompt. Default agent is "generalist".`,
      Kind.Agent,
      {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
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
