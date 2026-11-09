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

export const bypassCommand: SlashCommand = {
  name: 'bypass',
  altNames: ['yolo', '免审批', '放行', '完全访问', 'fullaccess'],
  description:
    '切换 Bypass 模式 (YOLO·全自动免审批)：自动放行并批准所有工具调用与命令执行。用法: /bypass [on|off]',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const config = context.services.agentContext?.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: '当前会话尚未就绪，无法切换 Bypass 模式。',
      });
      return;
    }

    const arg = args.trim().toLowerCase();
    const onArgs = ['on', '开', '开启', '1', 'true'];
    const offArgs = ['off', '关', '关闭', '0', 'false'];
    if (arg && !onArgs.includes(arg) && !offArgs.includes(arg)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: '参数无效。用法: /bypass [on|off]，不带参数时切换模式。',
      });
      return;
    }
    const isYolo = config.getApprovalMode() === ApprovalMode.YOLO;
    let enable = !isYolo;
    if (onArgs.includes(arg)) enable = true;
    if (offArgs.includes(arg)) enable = false;

    config.setApprovalMode(enable ? ApprovalMode.YOLO : ApprovalMode.DEFAULT);
    context.ui.addItem({
      type: enable ? MessageType.WARNING : MessageType.INFO,
      text: enable
        ? '🚀 [BYPASS 模式已激活] 已免除所有工具调用与命令执行的人工审批，Agent 将全自动自主执行。输入 /bypass off 或按 Shift+Tab 可退出。'
        : '✓ [BYPASS 模式已退出] 已恢复为标准人工审批模式。',
    });
  },
  completion: async (_context: CommandContext, partial: string) => {
    const list = ['on', 'off'];
    return list.filter((l) => l.startsWith(partial.toLowerCase()));
  },
};
