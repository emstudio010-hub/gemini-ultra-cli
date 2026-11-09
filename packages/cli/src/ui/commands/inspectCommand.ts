/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProviderManager,
  readDrillGrant,
  HybridMemoryEngine,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const inspectCommand: SlashCommand = {
  name: 'inspect',
  altNames: ['透视', '状态', 'in'],
  description: '一屏透视系统全貌：供应商、模型端点、思考强度、Skills、演练台、MCP 状态与记忆库。用法: /inspect',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const mgr = ProviderManager.getInstance();
    const activeProvider = mgr.getActiveProvider();
    const activeModel = mgr.getActiveModel();
    const effort = mgr.getReasoningEffort();
    const grant = readDrillGrant();

    const config = context.services.agentContext?.config;
    const currentModel = config?.getModel?.() || activeModel || 'gemini-2.5-pro';
    const skills = config?.getSkillManager?.()?.getSkills?.() || [];
    const memEngine = HybridMemoryEngine.getInstance();
    const memResults = memEngine.searchGraph('', 100);

    let text = '╭─ ✦ Gemini-Ultra CLI 全景状态透视 (System Inspector) ────────────╮\n';
    text += `│ 当前主控模型 : ${currentModel}\n`;
    text += `│ 活跃外接供应商: ${activeProvider ? `${activeProvider.name} (${activeProvider.baseUrl})` : 'Gemini Native (原生通道)'}\n`;
    text += `│ 思考强度等级 : [${effort.toUpperCase()}]\n`;
    text += `│ 演练台授权状态: ${grant.granted ? '🟢 已授权 (GRANTED)' : '⚪ 未授权'}\n`;
    text += `│ 已挂载技能数 : 累计 ${skills.length} 项 (可用 /skills list 查看)\n`;
    text += `│ 长期图谱记忆 : 累计 ${memResults.length} 条事实\n`;
    text += `│ 工作区目录   : ${config?.getTargetDir?.() || process.cwd()}\n`;
    text += '╰─────────────────────────────────────────────────────────────────╯';

    context.ui.addItem({
      type: MessageType.INFO,
      text,
    });
  },
};
