/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readDrillGrant,
  writeDrillGrant,
  runDrillPreflight,
  DrillStore,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const drillCommand: SlashCommand = {
  name: 'drill',
  altNames: ['演练台', '红队', 'd'],
  description:
    '红队演练与逆向工程事实工作台。用法: /drill [status | preflight | grant | facts]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'status',
      altNames: ['状态'],
      description: '查看当前演练台授权状态与网段范围',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const grant = readDrillGrant();
        const store = DrillStore.getInstance();
        const facts = store.queryFacts();

        let text = '=== 红队与逆向演练台状态 (Drill Workbench) ===\n';
        text += `• 授权状态: ${grant.granted ? '🟢 已授权 (GRANTED)' : '⚪ 未授权 (UNGRANTED)'}\n`;
        text += `• 授权记录: ${grant.at || '无'}\n`;
        text += `• 白名单网段: ${grant.allowedNetScope?.join(', ') || '127.0.0.1/32'}\n`;
        text += `• 事实库条数: 累计 ${facts.length} 项工件/漏洞\n`;
        text += '\n可用操作:\n• /drill preflight - 本机工具链巡检\n• /drill grant - 开启演练授权\n• /drill facts - 查看最新事实条目';

        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'preflight',
      altNames: ['巡检', '预检'],
      description: '巡检本机红队与逆向工具链就绪情况 (IDA/Ghidra/Radare2/JADX/Nuclei等)',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '正在巡检本机逆向与红队工具链，请稍候...',
        });

        const pre = await runDrillPreflight();
        let text = '=== 本机工具链巡检结果 (Preflight Checklist) ===\n';
        for (const [tool, status] of Object.entries(pre.tools)) {
          const icon = status.available ? '🟢 [就绪]' : '🔴 [缺失]';
          text += `• ${tool.padEnd(14)}: ${icon} ${status.pathOrStatus}\n`;
        }

        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'grant',
      altNames: ['授权'],
      description: '确认并写入演练台靶标测试授权',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const res = writeDrillGrant(true);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 演练台授权已生效！\n已记录至: ${res.path}\n时间: ${res.at}`,
        });
      },
    },
    {
      name: 'facts',
      altNames: ['事实', '工件'],
      description: '查看当前演练事实与逆向样本库',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const store = DrillStore.getInstance();
        const keyword = args.trim();
        const facts = store.queryFacts(undefined, keyword || undefined);

        let text = `=== 演练事实与逆向工件列表 (共 ${facts.length} 条) ===\n`;
        for (const f of facts.slice(0, 15)) {
          if (f.sample_path) {
            text += `\n[逆向样本 #${f.id}] ${f.sample_path}\n  SHA256: ${f.sha256}\n  文件类型: ${f.file_type} | 熵值: ${f.entropy} | 加壳: ${f.is_packed ? '是' : '否'}\n`;
          } else if (f.title) {
            text += `\n[漏洞 #${f.id}] [${(f.severity || 'info').toUpperCase()}] ${f.title}\n  CVE: ${f.cve || 'N/A'} | 状态: ${f.status}\n`;
          }
        }
        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
  ],
  action: async (context: CommandContext, args: string) => {
    const trimmed = args.trim();
    if (!trimmed || trimmed === 'status' || trimmed === '状态') {
      const statusCmd = drillCommand.subCommands?.find((c) => c.name === 'status');
      return statusCmd?.action?.(context, '');
    }
    const parts = trimmed.split(/\s+/);
    const sub = parts[0];
    const subArgs = parts.slice(1).join(' ');

    const matched = drillCommand.subCommands?.find(
      (c) => c.name === sub || c.altNames?.includes(sub),
    );
    if (matched?.action) {
      return matched.action(context, subArgs);
    }

    const statusCmd = drillCommand.subCommands?.find((c) => c.name === 'status');
    return statusCmd?.action?.(context, '');
  },
};
