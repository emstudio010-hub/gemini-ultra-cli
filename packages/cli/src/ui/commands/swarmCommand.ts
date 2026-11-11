/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import {
  ApprovalMode,
  I18nManager,
  createSwarm,
  latestSwarm,
  readSwarm,
  swarmSnapshot,
  postSwarmMessage,
  cancelSavedSwarm,
  resumeSwarm,
  setSwarmBudget,
  setSwarmModel,
  availableAgentModels,
  agentWorktreeCommand,
  isSwarmRunning,
  assertSwarmOwnership,
  requireSwarmWorktree,
  isAgentWorkflowRunning,
  exportSwarmReports,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { SwarmBoard } from '../components/SwarmBoard.js';
import { agentTaskCatalogText } from './agentTaskCatalog.js';

async function action(
  context: CommandContext,
  args: string,
  operation?: string,
): Promise<void | SlashCommandActionReturn> {
  const i18n = I18nManager.getInstance();
  try {
    const config = context.services.agentContext?.config;
    if (!config)
      throw new Error(
        i18n.t('当前配置尚未就绪。', 'Configuration is not ready.'),
      );
    const root = config.storage.getProjectTempDir();
    if (operation === 'list') {
      context.ui.addItem({
        type: MessageType.INFO,
        text: agentTaskCatalogText(root, args, 'swarm'),
      });
      return;
    }
    if (operation === 'prepare') {
      if (!args.trim())
        throw new Error(
          i18n.t('用法：/swarm prepare <任务>', 'Usage: /swarm prepare <task>'),
        );
      if (config.getApprovalMode() === ApprovalMode.PLAN)
        throw new Error(i18n.t('请先退出计划模式。', 'Leave Plan Mode first.'));
      const prepared = createSwarm(root, args.trim());
      context.ui.addItem({
        type: MessageType.INFO,
        text: i18n.t(
          `蜂群已准备：${prepared.id}。先用 /swarm model 配置角色或 @成员，再 /swarm resume 开始；尚未调用模型。`,
          `Swarm prepared: ${prepared.id}. Configure roles or @members with /swarm model, then start with /swarm resume. No model call made.`,
        ),
      });
      return;
    }
    if (operation === 'model' && !args.trim()) {
      context.ui.addItem({
        type: MessageType.INFO,
        text:
          i18n.t(
            '用法：/swarm model <researcher|coder|workflow-auditor|@成员> <供应商ID:模型|native:gemini-模型|inherit>\n已配置模型：',
            'Usage: /swarm model <researcher|coder|workflow-auditor|@member> <provider:model|native:gemini-model|inherit>\nConfigured models:',
          ) +
          '\n' +
          availableAgentModels().join('\n'),
      });
      return;
    }
    if (operation === 'cancel') {
      const cancelled = cancelSavedSwarm(root, args.trim() || undefined);
      context.ui.addItem({
        type: MessageType.INFO,
        text: cancelled.accountingUnknown
          ? i18n.t(
              `蜂群已取消。旧用量不可确认，原始状态保留：${cancelled.recoveryPath || '状态文件缺失'}。请创建新任务；此旧蜂群不能恢复。`,
              `Swarm cancelled. Historical usage is unavailable; original state retained: ${cancelled.recoveryPath || 'state missing'}. Create a new task; this swarm cannot resume.`,
            )
          : i18n.t(
              '蜂群已停止，留言与成员结果保留。',
              'Swarm stopped; its board and member results are retained.',
            ),
      });
      return;
    }
    if (operation === 'reports' && args.trim()) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: JSON.stringify(
          exportSwarmReports(root, args.trim(), i18n.getLocale()),
          null,
          2,
        ),
      });
      return;
    }
    let swarm =
      operation === 'status' && args.trim()
        ? readSwarm(root, args.trim())
        : latestSwarm(root);
    if (operation) {
      if (!swarm)
        throw new Error(
          i18n.t(
            '请先用 /swarm <任务> 创建蜂群。',
            'Create a swarm with /swarm <task> first.',
          ),
        );
      if (operation === 'board')
        return {
          type: 'custom_dialog',
          component: React.createElement(SwarmBoard, {
            root,
            id: swarm.id,
            onClose: context.ui.removeComponent,
          }),
        };
      if (operation === 'reports') {
        context.ui.addItem({
          type: MessageType.INFO,
          text: JSON.stringify(
            exportSwarmReports(root, swarm.id, i18n.getLocale()),
            null,
            2,
          ),
        });
        return;
      }
      if (operation === 'status') {
        const snapshot = swarmSnapshot(root, swarm.id);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Swarm ${snapshot.phase}\n${snapshot.objective}\n${i18n.t('角色模型', 'Role models')}: ${JSON.stringify(snapshot.roleModels)}\n${i18n.t('累计预算', 'Cumulative budget')}: ${JSON.stringify(snapshot.budget)}\n${snapshot.stopReason}\n${snapshot.members.map((member) => `@${member.name}: ${member.state} · ${member.model ?? snapshot.roleModels[member.agent] ?? 'inherit'} · ${member.modelsUsed.join(', ')}`).join('\n')}\n${snapshot.boardPath}\nID: ${snapshot.id}`,
        });
        return;
      }
      if (operation === 'workspace') {
        assertSwarmOwnership(root, swarm.id);
        if (isSwarmRunning(root, swarm.id) || isAgentWorkflowRunning(root))
          throw new Error(
            i18n.t(
              '请等待运行中的成员收尾后再管理工作树。',
              'Wait for running members to settle before managing the worktree.',
            ),
          );
        const state = agentWorktreeCommand(
          root,
          swarm.id,
          config.getTargetDir(),
          args,
          !swarm.members.some((member) => member.turns > 0),
          swarm.phase === 'completed',
        );
        if (args.trim() === 'on') requireSwarmWorktree(root, swarm.id);
        context.ui.addItem({
          type: MessageType.INFO,
          text: state
            ? JSON.stringify(state, null, 2)
            : i18n.t(
                '当前使用共享工作区。可在启动前用 /swarm workspace on 启用隔离。',
                'Using the shared workspace. Enable isolation with /swarm workspace on before starting.',
              ),
        });
        return;
      }
      if (operation === 'budget') {
        const values = args.trim().split(/\s+/);
        if (
          values.length !== 3 ||
          values.some((value) => !/^[1-9]\d*$/.test(value))
        )
          throw new Error(
            i18n.t(
              '用法：/swarm budget <模型调度上限> <失败轮数上限> <总唤醒上限>，例如 120 2 40。累计用量不会清零。',
              'Usage: /swarm budget <model-dispatch-limit> <failed-turn-limit> <total-turn-limit>, e.g. 120 2 40. Cumulative usage is retained.',
            ),
          );
        const [maxRequests, maxFailedTurns, maxTurns] = values.map(Number);
        setSwarmBudget(root, swarm.id, {
          maxRequests,
          maxFailedTurns,
          maxTurns,
        });
        context.ui.addItem({
          type: MessageType.INFO,
          text: i18n.t(
            '预算已保存；累计用量保留。受阻蜂群可用 /swarm resume 恢复。',
            'Budget saved; cumulative usage retained. Use /swarm resume to continue a blocked swarm.',
          ),
        });
        return;
      }
      if (operation === 'model') {
        const values = args.trim().split(/\s+/);
        if (values.length !== 2)
          throw new Error(
            i18n.t(
              '用法：/swarm model <角色|@成员> <供应商ID:模型|native:gemini-模型|inherit>',
              'Usage: /swarm model <role|@member> <provider:model|native:gemini-model|inherit>',
            ),
          );
        setSwarmModel(root, swarm.id, values[0], values[1]);
        context.ui.addItem({
          type: MessageType.INFO,
          text: i18n.t(
            '成员模型已保存，后续轮次生效；全局模型与累计用量保持。',
            'Member model saved for future turns; global model and cumulative usage retained.',
          ),
        });
        return;
      }
      if (operation === 'message') {
        postSwarmMessage(root, swarm.id, 'coordinator', args.trim());
        context.ui.addItem({
          type: MessageType.INFO,
          text: i18n.t(
            '留言已追加；被提及的等待成员已唤醒。',
            'Message posted; mentioned waiting members have been queued.',
          ),
        });
        return;
      }
      if (operation === 'resume') {
        if (swarm.phase === 'completed') {
          context.ui.addItem({
            type: MessageType.INFO,
            text: i18n.t(
              '该蜂群已完成，留言板保留。',
              'This swarm is complete; its board is retained.',
            ),
          });
          return;
        }
        await resumeSwarm(root, swarm.id);
      }
    } else {
      if (!args.trim()) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: i18n.t(
            '用法：/swarm <任务>；/swarm list|board|status|reports|model|budget|message|resume|cancel',
            'Usage: /swarm <task>; /swarm list|board|status|reports|model|budget|message|resume|cancel',
          ),
        });
        return;
      }
      if (config.getApprovalMode() === ApprovalMode.PLAN)
        throw new Error(
          i18n.t(
            '请先退出计划模式，再启动 Swarm。',
            'Leave Plan Mode before starting a swarm.',
          ),
        );
      swarm = createSwarm(root, args.trim());
    }
    return {
      type: 'submit_prompt',
      content: `You coordinate native swarm ${swarm.id}. Objective: ${swarm.objective}\nUse manage_swarm to add named workers with public briefs including owned paths, forbidden scope and acceptance criteria. Use local researcher/coder roles and at least one independent workflow-auditor verifier. Delegate technical work and keep the user informed. All members communicate publicly via post_swarm_message and @mentions; idle members wait without model calls. Use manage_swarm wait to await active turns, never repeated status polling. Add or mention the verifier AFTER implementation is ready; finish only after a current independent verdict. Shared working tree: writer/verifier turns are serialized; researchers may run concurrently. Honor the user's minimal validation requirements; do not add unrelated full/smoke suites. A paused member or unverified deliverable is not completion. Show /swarm board for live monitoring. Read the saved board and reuse existing evidence on resume.`,
    };
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: error instanceof Error ? error.message : 'Swarm command failed.',
    });
    return;
  }
}
const operations: Array<[string, string, string]> = [
  [
    'list',
    '查看当前项目所有 Agent 历史任务，可指定页码',
    'List saved Agent tasks in this project; optional page number',
  ],
  ['board', '打开实时留言与成员看板', 'Open the live board and roster'],
  [
    'status',
    '查看蜂群状态，可指定任务ID',
    'Show swarm status; optional task ID',
  ],
  [
    'reports',
    '导出成员结果与留言索引，可指定任务ID',
    'Export member results and board; optional task ID',
  ],
  ['budget', '设置累计执行预算', 'Set cumulative execution limits'],
  ['model', '设置角色或成员模型', 'Choose a role or member model'],
  [
    'workspace',
    '管理隔离工作树与成果补丁',
    'Manage isolated worktree and result patch',
  ],
  [
    'prepare',
    '先创建任务，配置模型后再开始',
    'Prepare a task before choosing models and starting',
  ],
  [
    'message',
    '公开留言并提及成员',
    'Post a public message and mention members',
  ],
  ['resume', '恢复已保存的蜂群', 'Resume the saved swarm'],
  [
    'cancel',
    '停止并保留状态，可指定蜂群 ID',
    'Stop and preserve state; optional swarm ID',
  ],
];
export const swarmCommand: SlashCommand = {
  name: 'swarm',
  altNames: ['蜂群'],
  get description() {
    return I18nManager.getInstance().t(
      '通过共享留言板协调具名成员',
      'Coordinate named workers on a shared message board',
    );
  },
  kind: CommandKind.BUILT_IN,
  action: (context, args) => action(context, args),
  subCommands: operations.map(([name, zh, en]) => ({
    name,
    get description() {
      return I18nManager.getInstance().t(zh, en);
    },
    kind: CommandKind.BUILT_IN,
    isSafeConcurrent: ['list', 'board', 'status', 'message', 'cancel'].includes(
      name,
    ),
    autoExecute: ![
      'message',
      'budget',
      'cancel',
      'model',
      'prepare',
      'workspace',
      'reports',
      'list',
      'status',
    ].includes(name),
    action: (context, args) => action(context, args, name),
  })),
};
