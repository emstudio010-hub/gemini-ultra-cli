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
  swarmSnapshot,
  postSwarmMessage,
  cancelSwarm,
  resumeSwarm,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { SwarmBoard } from '../components/SwarmBoard.js';

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
    let swarm = latestSwarm(root);
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
      if (operation === 'status') {
        const snapshot = swarmSnapshot(root, swarm.id);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Swarm ${snapshot.phase}\n${snapshot.objective}\n${snapshot.members.map((member) => `@${member.name}: ${member.state}`).join('\n')}\n${snapshot.boardPath}`,
        });
        return;
      }
      if (operation === 'cancel') {
        cancelSwarm(root, swarm.id);
        context.ui.addItem({
          type: MessageType.INFO,
          text: i18n.t(
            '蜂群已停止，留言与成员结果保留。',
            'Swarm stopped; its board and member results are retained.',
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
            '用法：/swarm <任务>；/swarm board|status|message|resume|cancel',
            'Usage: /swarm <task>; /swarm board|status|message|resume|cancel',
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
  ['board', '打开实时留言与成员看板', 'Open the live board and roster'],
  ['status', '查看蜂群状态', 'Show swarm status'],
  [
    'message',
    '公开留言并提及成员',
    'Post a public message and mention members',
  ],
  ['resume', '恢复已保存的蜂群', 'Resume the saved swarm'],
  ['cancel', '停止成员并保留留言', 'Stop members and retain the board'],
];
export const swarmCommand: SlashCommand = {
  name: 'swarm',
  altNames: ['蜂群'],
  description: 'Coordinate named workers on a shared message board',
  kind: CommandKind.BUILT_IN,
  action: (context, args) => action(context, args),
  subCommands: operations.map(([name, zh, en]) => ({
    name,
    get description() {
      return I18nManager.getInstance().t(zh, en);
    },
    kind: CommandKind.BUILT_IN,
    isSafeConcurrent: ['board', 'status', 'message', 'cancel'].includes(name),
    autoExecute: name !== 'message',
    action: (context, args) => action(context, args, name),
  })),
};
