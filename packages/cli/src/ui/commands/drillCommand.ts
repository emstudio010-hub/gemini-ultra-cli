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

const t = (zh: string, en: string) => I18nManager.getInstance().t(zh, en);

async function openCockpit(context: CommandContext): Promise<void> {
  const url = await startDrillCockpit();
  context.ui.addItem({
    type: MessageType.INFO,
    text: t(
      `演练台已启动：${url}\n任务执行与审批请查看当前终端。使用 /drill stop 关闭控制台。`,
      `Drill Cockpit started: ${url}\nFollow task execution and approvals in this terminal. Use /drill stop to close the cockpit.`,
    ),
  });
  try {
    await open(url);
  } catch {
    context.ui.addItem({
      type: MessageType.WARNING,
      text: t(
        '无法自动打开浏览器，请打开上方地址。',
        'Could not open the browser automatically. Open the URL above.',
      ),
    });
  }
}

export const drillCommand: SlashCommand = {
  name: 'drill',
  altNames: ['演练台', 'd'],
  get description() {
    return t(
      '打开演练台控制中心。用法: /drill [setup | ui | status | preflight | grant | facts | stop]',
      'Open the Drill Cockpit. Usage: /drill [setup | ui | status | preflight | grant | facts | stop]',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'setup',
      altNames: ['安装', '环境'],
      get description() {
        return t(
          '检查本机逆向环境并显示安装与路径配置说明',
          'Check the local reverse engineering environment and configuration instructions',
        );
      },
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
              '\n\n无需外部依赖即可使用 binary_triage 做静态初筛。binary_decompile 使用 Ghidra + 兼容JDK反编译单个函数并保留完整工件；设置 GEMINI_ULTRA_GHIDRA_HOME 为安装根目录，JAVA_HOME 为JDK目录，或 GEMINI_ULTRA_TOOL_JAVA 为原生Java路径。radare2用于反汇编；Android可选JADX，IDA由用户提供许可。工具可加入PATH，或用 GEMINI_ULTRA_TOOL_R2、GEMINI_ULTRA_TOOL_JADX、GEMINI_ULTRA_TOOL_ANALYZEHEADLESS 指定路径。\n每台电脑独立配置模型、工具、MCP与授权，不依赖开发机目录。',
              '\n\nbinary_triage works without external tools. binary_decompile uses Ghidra and a compatible JDK to recover one function and retain full artifacts. Set GEMINI_ULTRA_GHIDRA_HOME to its installation root and JAVA_HOME to the JDK, or GEMINI_ULTRA_TOOL_JAVA to native Java. radare2 provides disassembly; JADX is optional for Android. IDA requires your own license. Add tools to PATH or set GEMINI_ULTRA_TOOL_R2, GEMINI_ULTRA_TOOL_JADX or GEMINI_ULTRA_TOOL_ANALYZEHEADLESS.\nConfigure models, tools, MCP and authorization independently on each computer.',
            ),
        });
      },
    },
    {
      name: 'ui',
      altNames: ['web', '界面'],
      get description() {
        return t(
          '打开当前 CLI 会话的浏览器控制中心',
          'Open the browser cockpit for this CLI session',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: openCockpit,
    },
    {
      name: 'stop',
      altNames: ['关闭'],
      get description() {
        return t(
          '关闭演练台 Web 控制中心',
          'Close the Drill Cockpit web service',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        stopDrillCockpit();
        context.ui.addItem({
          type: MessageType.INFO,
          text: t(
            '演练台 Web 控制中心已关闭。',
            'Drill Cockpit web service stopped.',
          ),
        });
      },
    },
    {
      name: 'status',
      altNames: ['状态'],
      get description() {
        return t(
          '查看当前演练台授权状态与网段范围',
          'Show drill authorization and network scope',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const grant = readDrillGrant();
        const store = DrillStore.getInstance();
        const facts = store.queryFacts();

        let text = t(
          '=== 红队与逆向演练台状态 ===\n',
          '=== Drill Workbench Status ===\n',
        );
        text += `• ${t('授权状态', 'Authorization')}: ${grant.granted ? t('🟢 已授权', '🟢 Granted') : t('⚪ 未授权', '⚪ Not granted')}\n`;
        text += `• ${t('授权记录', 'Grant record')}: ${grant.at || t('无', 'none')}\n`;
        text += `• ${t('白名单网段', 'Allowed network scope')}: ${grant.allowedNetScope?.join(', ') || '127.0.0.1/32'}\n`;
        text += `• ${t('当前查询事实数', 'Facts in current query')}: ${facts.length}\n`;
        text += t(
          '\n可用操作:\n• /drill preflight - 本机工具链巡检\n• /drill grant - 开启演练授权\n• /drill facts - 查看最新事实条目',
          '\nCommands:\n• /drill preflight - Check local tools\n• /drill grant - Record drill authorization\n• /drill facts - Show recent facts',
        );

        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'preflight',
      altNames: ['巡检', '预检'],
      get description() {
        return t(
          '巡检本机红队与逆向工具链就绪情况 (IDA/Ghidra/Radare2/JADX/Nuclei等)',
          'Check local reverse engineering tools (IDA/Ghidra/Radare2/JADX/Nuclei)',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: t(
            '正在巡检本机逆向与红队工具链，请稍候...',
            'Checking local reverse engineering tools, please wait...',
          ),
        });

        const pre = await runDrillPreflight();
        let text = t(
          '=== 本机工具链巡检结果 ===\n',
          '=== Local Tool Checklist ===\n',
        );
        for (const [tool, status] of Object.entries(pre.tools)) {
          const icon = status.available
            ? t('🟢 [就绪]', '🟢 [ready]')
            : t('🔴 [缺失]', '🔴 [missing]');
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
      get description() {
        return t(
          '确认并写入演练台靶标测试授权',
          'Confirm and record drill authorization',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const res = writeDrillGrant(true);
        context.ui.addItem({
          type: MessageType.INFO,
          text: t(
            `✓ 演练台授权已生效！\n已记录至: ${res.path}\n时间: ${res.at}`,
            `✓ Drill authorization recorded.\nFile: ${res.path}\nTime: ${res.at}`,
          ),
        });
      },
    },
    {
      name: 'facts',
      altNames: ['事实', '工件'],
      get description() {
        return t(
          '查看当前演练事实与逆向样本库',
          'Show drill facts and reverse engineering samples',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const store = DrillStore.getInstance();
        const keyword = args.trim();
        const facts = store.queryFacts(undefined, keyword || undefined);

        let text = t(
          `=== 演练事实与逆向工件列表 (返回 ${facts.length} 条) ===\n`,
          `=== Drill Facts and Reverse Artifacts (${facts.length} returned) ===\n`,
        );
        for (const f of facts.slice(0, 15)) {
          if (f['factType'] === 'note') {
            text += `\n[${t('笔记', 'Note')} #${f['id'] ?? '-'}] ${f['title']}\n  ${[f['evidence'], f['content']].filter(Boolean).join('\n  ')}\n`;
          } else if (f['sample_path']) {
            text += `\n[${t('逆向样本', 'Binary sample')} #${f['id']}] ${f['sample_path']}\n  SHA256: ${f['sha256']}\n  ${t('文件类型', 'File type')}: ${f['file_type']} | ${t('熵值', 'Entropy')}: ${f['entropy']} | ${t('加壳', 'Packed')}: ${f['is_packed'] ? t('是', 'yes') : t('否', 'no')}\n`;
          } else if (f['factType'] === 'binary') {
            text += `\n[${t('逆向样本', 'Binary sample')}] ${f['title']}\n  ${f['content']}\n`;
          } else if (f['title']) {
            text += `\n[${t('漏洞', 'Finding')} #${f['id'] ?? '-'}] [${String(f['severity'] || 'info').toUpperCase()}] ${f['title']}\n  CVE: ${f['cve'] || 'N/A'} | ${t('状态', 'Status')}: ${f['status'] || 'N/A'}\n`;
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
      text: t(
        '未知操作。用法: /drill [setup | ui | status | preflight | grant | facts | stop]',
        'Unknown operation. Usage: /drill [setup | ui | status | preflight | grant | facts | stop]',
      ),
    });
  },
};
