/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEvents } from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const goalCommand: SlashCommand = {
  name: 'goal',
  altNames: ['目标', '自动达标', 'g'],
  description:
    '开启目标驱动长程自主推进模式 (Autonomous Goal Mode)。用法: /goal <最终交付目标>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const goalText = args.trim();
    if (!goalText) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: '用法: /goal <目标描述>\n示例: /goal 完成用户认证模块重构并编写完整集成测试，确保构建 0 错误',
      });
      return;
    }

    coreEvents.emitFeedback(
      'info',
      `[Goal Autonomous Loop] 目标模式已激活: "${goalText}"`,
    );

    context.ui.addItem({
      type: MessageType.INFO,
      text:
        `╭─ ✦ 目标自驱长程模式已激活 (Goal Mode) ─────────────────────────────────╮\n` +
        `│ 设定目标: ${goalText}\n` +
        `│ 执行策略: 自动拆解子任务 -> 循环执行代码变更 -> 自动运行验证测试\n` +
        `│ 终止标准: 直至构建通过且所有验证点确证完成\n` +
        `╰────────────────────────────────────────────────────────────────────────╯\n` +
        `提示: 可随时使用 Ctrl+C 中断或输入 /plan 切换回计划审批模式。`,
    });

    return {
      type: 'submit_prompt',
      content:
        `【目标模式 / Goal Mode】请自主完成以下最终交付目标，不要中途停下询问：\n\n${goalText}\n\n` +
        `执行要求：\n1. 先用 write_todos 拆解子任务并维护进度；\n2. 逐项实施，独立任务可交给 spawn_subagents，给每个代理明确的文件范围；\n3. 只运行与变更相关的必要检查，尊重用户的测试范围，不进行冗余冒烟测试；\n` +
        `4. 失败则定位根因并修复，直到构建通过且所有验证点确证完成；\n5. 最后给出带证据的中文总结。`,
    };
  },
};
