/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HybridMemoryEngine,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const tasteCommand: SlashCommand = {
  name: 'taste',
  altNames: ['偏好', '品味', 'ts'],
  description: '查看或配置当前工程的代码审美与工程品味 (taste.md)。用法: /taste [show | set <偏好规则>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'show',
      altNames: ['查看'],
      description: '查看当前生效的工程品味与代码纪律',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const cwd = context.services.agentContext?.config?.getTargetDir?.() || process.cwd();
        const engine = HybridMemoryEngine.getInstance();
        const content = engine.readTasteMd(cwd);

        if (!content.trim()) {
          context.ui.addItem({
            type: MessageType.INFO,
            text: '（当前项目尚未配置特定的 taste.md 偏好，可通过 `/偏好 追加 <规则>` 进行配置）',
          });
          return;
        }

        context.ui.addItem({
          type: MessageType.INFO,
          text: `=== 当前工程品味与代码纪律 (.gemini/taste.md) ===\n\n${content}`,
        });
      },
    },
    {
      name: 'set',
      altNames: ['追加', '设置'],
      description: '追加或更新工程品味规则: /taste set <规则文本>',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const text = args.trim();
        if (!text) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '用法: /taste set <规范要求或偏好>',
          });
          return;
        }

        const cwd = context.services.agentContext?.config?.getTargetDir?.() || process.cwd();
        const engine = HybridMemoryEngine.getInstance();
        const existing = engine.readTasteMd(cwd);
        const updated = existing ? `${existing}\n- ${text}\n` : `# Engineering Taste & Coding Standards\n\n- ${text}\n`;
        const savedPath = engine.updateTasteMd(updated, cwd);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 工程品味已写入: ${savedPath}\n内容:\n${text}`,
        });
      },
    },
  ],
  action: async (context: CommandContext, args: string) => {
    const trimmed = args.trim();
    if (!trimmed || trimmed === 'show' || trimmed === '查看') {
      const showCmd = tasteCommand.subCommands?.find((c) => c.name === 'show');
      return showCmd?.action?.(context, '');
    }
    const parts = trimmed.split(/\s+/);
    const sub = parts[0];
    const subArgs = parts.slice(1).join(' ');

    const matched = tasteCommand.subCommands?.find(
      (c) => c.name === sub || c.altNames?.includes(sub),
    );
    if (matched?.action) {
      return matched.action(context, subArgs);
    }
    const showCmd = tasteCommand.subCommands?.find((c) => c.name === 'show');
    return showCmd?.action?.(context, '');
  },
};
