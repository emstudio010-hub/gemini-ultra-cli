/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ApprovalMode,
  I18nManager,
  createAgentWorkflow,
  latestAgentWorkflow,
  saveAgentWorkflow,
  cancelAgentWorkflow,
  isAgentWorkflowRunning,
  type AgentWorkflow,
  type AgentWorkflowMode,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';

function interviewPrompt(record: AgentWorkflow): string {
  return `Workflow ${record.id} (${record.mode}), phase ${record.phase}.\nObjective: ${record.objective}\nExisting brief: ${record.brief}\nRead relevant workspace sources first; never ask the user what the code already answers. Ask ONE focused question at a time using ask_user, with 2-4 concrete options and the recommended option first, plus the existing free-text facility. Respect answered questions, stated constraints, and the user's language. Do not ask redundant approval questions. Clarify outcome, boundaries, compatibility and objective acceptance. You are in read-only Plan Mode: no implementation, commands that modify files, or worker launch. When aligned, call draft_agent_workflow with workflow_id=${record.id}, an agreed brief and bounded milestones each with explicit acceptance criteria. Present the draft and await ${record.mode === 'grill-me' ? '/grill-me finish' : '/teamwork approve'}. Run only necessary relevant validation when implementation is later approved; no unsolicited full or smoke suites.`;
}
function executionPrompt(record: AgentWorkflow): string {
  return `Run the approved ${record.mode} workflow ${record.id} using run_agent_workflow({"workflow_id":"${record.id}"}). The native tool owns investigation, serial implementation, independent acceptance review and persisted milestone progress. Do not create duplicate ad hoc batches or reimplement this orchestration yourself. Honor the user's validation scope. On return, integrate stage evidence and deliverables into a concise response. A blocked or cancelled run is not completion; do not automatically retry it.\nObjective: ${record.objective}\nAgreed brief: ${record.brief}`;
}
function workflowCommand(
  mode: AgentWorkflowMode,
  altNames: string[],
): SlashCommand {
  const action = async (
    context: CommandContext,
    args: string,
    operation?: string,
  ): Promise<void | SlashCommandActionReturn> => {
    const i18n = I18nManager.getInstance();
    const config = context.services.agentContext?.config;
    const info = (text: string) =>
      context.ui.addItem({ type: MessageType.INFO, text });
    try {
      if (!config)
        throw new Error(
          i18n.t('当前配置尚未就绪。', 'Configuration is not ready.'),
        );
      const root = config.storage.getProjectTempDir();
      const text =
        args.trim() ||
        (!operation && mode === 'grill-me'
          ? i18n.t(
              '澄清当前工作区要完成的目标',
              'Clarify the intended task for this workspace',
            )
          : '');
      if (!operation && !text) {
        info(
          i18n.t(
            `用法：/${mode} <任务>；/${mode} status|resume|cancel${mode === 'teamwork' ? '|approve' : mode === 'grill-me' ? '|finish' : ''}`,
            `Usage: /${mode} <task>; /${mode} status|resume|cancel${mode === 'teamwork' ? '|approve' : mode === 'grill-me' ? '|finish' : ''}`,
          ),
        );
        return;
      }
      let record = latestAgentWorkflow(root, mode);
      const restoreApproval = (entry: AgentWorkflow) => {
        if (config.getApprovalMode() === ApprovalMode.PLAN) {
          const previous = Object.values(ApprovalMode).find(
            (value) => value === entry.previousApprovalMode,
          );
          config.setApprovalMode(previous || ApprovalMode.DEFAULT);
        }
      };
      if (operation === 'status') {
        info(
          record
            ? `${record.mode}: ${record.phase}\n${record.objective}\n${record.stage}\n${record.milestones.map((item, index) => `${index + 1}. [${item.completed ? 'x' : ' '}] ${item.title}\n${item.acceptance}`).join('\n')}\nID: ${record.id}`
            : i18n.t(
                '当前项目没有该工作流。',
                'No workflow of this kind in this project.',
              ),
        );
        return;
      }
      if (operation) {
        if (!record)
          throw new Error(i18n.t('请先创建任务。', 'Create a task first.'));
        if (operation === 'cancel') {
          record = cancelAgentWorkflow(root, record.id);
          restoreApproval(record);
          info(
            i18n.t(
              '已请求停止；阶段结果保留，运行中的子任务清理结束后释放工作区。',
              'Stop requested; stage results are retained. The workspace is released after running children settle.',
            ),
          );
          return;
        }
        if (isAgentWorkflowRunning(root))
          throw new Error(
            i18n.t(
              '当前项目已有工作流正在执行，可查看状态或取消。',
              'A workflow is running in this project; inspect its status or cancel it.',
            ),
          );
        if (record.phase === 'completed') {
          info(
            i18n.t(
              '该工作流已完成，结果保留。',
              'This workflow is complete; its results are retained.',
            ),
          );
          return;
        }
        if (operation === 'approve' || operation === 'finish') {
          if (record.phase !== 'ready' || record.approved)
            throw new Error(
              i18n.t(
                '请先完成需求对齐并保存草案。',
                'Finish scoping and save the draft first.',
              ),
            );
          record.approved = true;
          restoreApproval(record);
          if (mode === 'grill-me') {
            record.phase = 'completed';
            saveAgentWorkflow(root, record);
            return {
              type: 'submit_prompt',
              content: `Requirements interview complete. Continue the agreed task under the current permissions and user constraints.\n${record.brief}\nAcceptance:\n${record.milestones.map((item) => `${item.title}: ${item.acceptance}`).join('\n')}`,
            };
          }
        } else if (operation === 'resume') {
          if (!record.approved) {
            record.phase = 'scoping';
            saveAgentWorkflow(root, record);
            config.setApprovalMode(ApprovalMode.PLAN);
            return { type: 'submit_prompt', content: interviewPrompt(record) };
          }
          restoreApproval(record);
          record.phase = 'ready';
        }
        saveAgentWorkflow(root, record);
        return { type: 'submit_prompt', content: executionPrompt(record) };
      }
      if (isAgentWorkflowRunning(root))
        throw new Error(
          i18n.t(
            '当前项目已有工作流正在执行。',
            'A workflow is running in this project.',
          ),
        );
      for (const kind of ['teamwork', 'grill-me'] as const) {
        const unfinished = latestAgentWorkflow(root, kind);
        if (
          unfinished &&
          !unfinished.approved &&
          ['scoping', 'ready'].includes(unfinished.phase)
        )
          throw new Error(
            i18n.t(
              `请先用 /${kind} resume 继续对齐，或 /${kind} cancel 取消当前访谈。`,
              `Use /${kind} resume or /${kind} cancel to resolve the current interview first.`,
            ),
          );
      }
      if (mode === 'boost' && config.getApprovalMode() === ApprovalMode.PLAN)
        throw new Error(
          i18n.t(
            '请先退出计划模式，再启动 Boost 执行。',
            'Leave Plan Mode before starting Boost execution.',
          ),
        );
      record = createAgentWorkflow(root, mode, text, config.getApprovalMode());
      if (mode !== 'boost') config.setApprovalMode(ApprovalMode.PLAN);
      info(
        i18n.t(
          `${mode} 已创建：${record.id}；进度按项目保存。`,
          `${mode} created: ${record.id}; progress is saved for this project.`,
        ),
      );
      return {
        type: 'submit_prompt',
        content:
          mode === 'boost' ? executionPrompt(record) : interviewPrompt(record),
      };
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text:
          error instanceof Error ? error.message : 'Workflow command failed.',
      });
      return;
    }
  };
  const operations = [
    'status',
    'resume',
    'cancel',
    ...(mode === 'teamwork'
      ? ['approve']
      : mode === 'grill-me'
        ? ['finish']
        : []),
  ];
  return {
    name: mode,
    altNames,
    kind: CommandKind.BUILT_IN,
    description: `${mode}: scoped agent workflow`,
    autoExecute: false,
    action: (context, args) => action(context, args),
    subCommands: operations.map((name) => ({
      name,
      get description() {
        const labels: Record<string, [string, string]> = {
          status: ['查看阶段与里程碑', 'Show stages and milestones'],
          resume: ['恢复已保存任务', 'Resume the saved workflow'],
          cancel: ['取消并保留结果', 'Cancel and retain results'],
          approve: ['按已对齐的草案执行', 'Execute the scoped draft'],
          finish: ['结束访谈并继续任务', 'Finish the interview and continue'],
        };
        return I18nManager.getInstance().t(...labels[name]);
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: name === 'status' || name === 'cancel',
      action: (context, args) => action(context, args, name),
    })),
  };
}
export const boostCommand = workflowCommand('boost', ['强化', '攻坚']);
export const teamworkCommand = workflowCommand('teamwork', ['团队任务']);
export const grillMeCommand = workflowCommand('grill-me', [
  'grillme',
  'grill',
  '需求对齐',
]);
