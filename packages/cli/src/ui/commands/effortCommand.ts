/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ProviderManager,
  type ReasoningEffortLevel,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { EffortDialog } from '../components/EffortDialog.js';

export const effortCommand: SlashCommand = {
  name: 'effort',
  altNames: ['深思', '强度', '思考', 'e'],
  description:
    '调整大模型思考/推理强度: low (轻快) / medium (均衡) / high (深思) / xhigh (极智) / max (穷尽) / ultra (终极·多代理)。用法: /effort <级别>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string): Promise<void | SlashCommandActionReturn> => {
    const mgr = ProviderManager.getInstance();
    const target = args.trim().toLowerCase();

    if (!target) {
      return {
        type: 'custom_dialog',
        component: React.createElement(EffortDialog, {
          onClose: () => context.ui.removeComponent(),
        }),
      };
    }

    const validLevels: Record<string, ReasoningEffortLevel> = {
      low: 'low',
      轻快: 'low',
      medium: 'medium',
      均衡: 'medium',
      high: 'high',
      深思: 'high',
      xhigh: 'xhigh',
      极智: 'xhigh',
      max: 'max',
      穷尽: 'max',
      ultra: 'ultra',
      终极: 'ultra',
    };

    const chosen = validLevels[target];
    if (!chosen) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `无效级别 "${target}"。可选: low, medium, high, xhigh, max, ultra`,
      });
      return;
    }

    mgr.setReasoningEffort(chosen);
    context.ui.addItem({
      type: MessageType.INFO,
      text: `✓ 思考强度已更新为: [${chosen.toUpperCase()}]（将自动注入后续推理与代码生成请求）`,
    });
  },
  completion: async (_context: CommandContext, partial: string) => {
    const list = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', '轻快', '均衡', '深思', '极智', '穷尽', '终极'];
    return list.filter((l) => l.startsWith(partial));
  },
};
