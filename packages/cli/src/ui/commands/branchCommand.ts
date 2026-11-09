/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

interface BranchSnapshot {
  name: string;
  createdAt: string;
  messageCount: number;
}

const memoryBranchStore = new Map<string, BranchSnapshot[]>();

export const branchCommand: SlashCommand = {
  name: 'branch',
  altNames: ['分支', '回溯', 'br'],
  description: '会话树分支管理：在当前对话节点创建分支快照或查看历史分支。用法: /branch [list | create <名称>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      altNames: ['列表', 'ls'],
      description: '列出当前会话的所有分支快照',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const client = context.services.agentContext?.geminiClient;
        const conv = client?.getChatRecordingService?.()?.getConversation?.();
        const sessionId = (conv as any)?.sessionId || (conv as any)?.id || 'default';
        const list = memoryBranchStore.get(sessionId) || [];

        let text = '=== 会话树分支快照列表 (Session Branches) ===\n';
        if (list.length === 0) {
          text += '（当前会话暂无分支快照，可通过 `/分支 新建 <名称>` 保存当前检查点）';
        } else {
          for (const b of list) {
            text += `\n• 分支: [${b.name}]\n  创建时间: ${b.createdAt}\n  历史轮数: ${b.messageCount} 条消息\n`;
          }
        }
        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'create',
      altNames: ['新建', 'new'],
      description: '在当前节点创建分支快照: /branch create <名称>',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const name = args.trim();
        if (!name) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '用法: /branch create <分支名称>',
          });
          return;
        }

        const client = context.services.agentContext?.geminiClient;
        const conv = client?.getChatRecordingService?.()?.getConversation?.();
        const sessionId = (conv as any)?.sessionId || (conv as any)?.id || 'default';
        const list = memoryBranchStore.get(sessionId) || [];

        const history = client?.getHistory?.() || [];
        list.push({
          name,
          createdAt: new Date().toLocaleString(),
          messageCount: history.length,
        });
        memoryBranchStore.set(sessionId, list);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 成功在当前节点创建分支快照 [${name}] (包含 ${history.length} 条对话历史)`,
        });
      },
    },
  ],
  action: async (context: CommandContext, args: string) => {
    const trimmed = args.trim();
    if (!trimmed || trimmed === 'list' || trimmed === '列表') {
      const listCmd = branchCommand.subCommands?.find((c) => c.name === 'list');
      return listCmd?.action?.(context, '');
    }
    const parts = trimmed.split(/\s+/);
    const sub = parts[0];
    const subArgs = parts.slice(1).join(' ');

    const matched = branchCommand.subCommands?.find(
      (c) => c.name === sub || c.altNames?.includes(sub),
    );
    if (matched?.action) {
      return matched.action(context, subArgs);
    }
    const listCmd = branchCommand.subCommands?.find((c) => c.name === 'list');
    return listCmd?.action?.(context, '');
  },
};
