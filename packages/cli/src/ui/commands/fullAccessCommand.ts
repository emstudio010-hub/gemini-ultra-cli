/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const fullAccessCommand: SlashCommand = {
  name: 'fullaccess',
  altNames: ['完全访问', '完全权限', '全权限'],
  description:
    '切换完全访问权限 (Full Access)：自动批准所有工具调用。用法: /fullaccess [on|off]',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const config = context.services.agentContext?.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: '当前会话尚未就绪，无法切换权限。',
      });
      return;
    }

    const arg = args.trim().toLowerCase();
    const current = config.getApprovalMode() === ApprovalMode.YOLO;
    let enable = !current;
    if (['on', '开', '开启', '1', 'true'].includes(arg)) enable = true;
    if (['off', '关', '关闭', '0', 'false'].includes(arg)) enable = false;

    config.setApprovalMode(enable ? ApprovalMode.YOLO : ApprovalMode.DEFAULT);
    context.ui.addItem({
      type: enable ? MessageType.WARNING : MessageType.INFO,
      text: enable
        ? '⚠ 完全访问权限已开启：所有工具调用（含 Shell、写文件）将自动批准，不再弹出确认。可用 /fullaccess off 或 Shift+Tab 关闭。'
        : '✓ 完全访问权限已关闭，已恢复为默认审批模式。',
    });
  },
};
