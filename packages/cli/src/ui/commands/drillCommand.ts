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
  I18nManager,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import open from 'open';
import {
  startDrillCockpit,
  stopDrillCockpit,
} from '../../services/drillCockpit.js';

async function openCockpit(context: CommandContext): Promise<void> {
  const url = await startDrillCockpit();
  context.ui.addItem({
    type: MessageType.INFO,
    text: `演练台已启动：${url}\n任务执行与审批请查看当前终端。使用 /drill stop 关闭控制台。`,
  });
  try {
    await open(url);
  } catch {
    context.ui.addItem({
      type: MessageType.WARNING,
      text: '无法自动打开浏览器，请打开上方地址。',
    });
  }
}

export const drillCommand: SlashCommand = {
  name: 'drill',
  altNames: ['演练台', 'd'],
  description:
    '打开演练台控制中心。用法: /drill [ui | status | preflight | grant | facts | stop]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'setup',
      altNames: ['安装', '环境'],
      description: '检查本机逆向环境并显示安装与路径配置说明',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        const i18n = I18nManager.getInstance();
        const result = await runDrillPreflight();
        const rows = Object.entries(result.tools).map(
          ([name, info]) =>
            `${info.available ? '[OK]' : '[--]'} ${name}: ${info.pathOrStatus}`,
        );
        context.ui.addItem({
          type: MessageType.INFO,
          text:
            i18n.t(
              '本机逆向环境\n',
              'Local reverse engineering environment\n',
            ) +
            rows.join('\n') +
            i18n.t(
              '\n\n无需外部依赖即可使用 binary_triage 做静态初筛。深入反编译可安装 Ghidra + JDK 或 radare2；Android 可选 JADX。IDA 由用户提供许可。将工具加入 PATH，或设置 GEMINI_ULTRA_TOOL_R2、GEMINI_ULTRA_TOOL_JADX、GEMINI_ULTRA_TOOL_ANALYZEHEADLESS 等为完整可执行文件路径。\n每台电脑独立配置模型、MCP 与授权，不依赖开发机目录。',
              '\n\nThe built-in binary_triage tool works without external tools. Install Ghidra + JDK or radare2 for deeper analysis, and JADX for Android. IDA needs your own license. Add tools to PATH or set GEMINI_ULTRA_TOOL_R2, GEMINI_ULTRA_TOOL_JADX or GEMINI_ULTRA_TOOL_ANALYZEHEADLESS to an executable path.\nConfigure models, MCP and authorization separately on each computer.',
            ),
        });
      },
    },
    {
      name: 'ui',
      altNames: ['web', '界面'],
      description: '打开当前 CLI 会话的浏览器控制中心',
      kind: CommandKind.BUILT_IN,
      action: openCockpit,
    },
    {
      name: 'stop',
      altNames: ['关闭'],
      description: '关闭演练台 Web 控制中心',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        stopDrillCockpit();
        context.ui.addItem({
          type: MessageType.INFO,
          text: '演练台 Web 控制中心已关闭。',
        });
      },
    },
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
        text +=
          '\n可用操作:\n• /drill preflight - 本机工具链巡检\n• /drill grant - 开启演练授权\n• /drill facts - 查看最新事实条目';

        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'preflight',
      altNames: ['巡检', '预检'],
      description:
        '巡检本机红队与逆向工具链就绪情况 (IDA/Ghidra/Radare2/JADX/Nuclei等)',
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
          if (f['factType'] === 'note') {
            text += `\n[笔记 #${f['id'] ?? '-'}] ${f['title']}\n  ${[f['evidence'], f['content']].filter(Boolean).join('\n  ')}\n`;
          } else if (f['sample_path']) {
            text += `\n[逆向样本 #${f['id']}] ${f['sample_path']}\n  SHA256: ${f['sha256']}\n  文件类型: ${f['file_type']} | 熵值: ${f['entropy']} | 加壳: ${f['is_packed'] ? '是' : '否'}\n`;
          } else if (f['factType'] === 'binary') {
            text += `\n[逆向样本] ${f['title']}\n  ${f['content']}\n`;
          } else if (f['title']) {
            text += `\n[漏洞 #${f['id'] ?? '-'}] [${String(f['severity'] || 'info').toUpperCase()}] ${f['title']}\n  CVE: ${f['cve'] || 'N/A'} | 状态: ${f['status'] || 'N/A'}\n`;
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
    if (!trimmed) return openCockpit(context);
    if (trimmed === 'status' || trimmed === '状态') {
      const statusCmd = drillCommand.subCommands?.find(
        (c) => c.name === 'status',
      );
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

    context.ui.addItem({
      type: MessageType.ERROR,
      text: '未知操作。用法: /drill [ui | status | preflight | grant | facts | stop]',
    });
  },
};
