/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ProviderManager,
  I18nManager,
  getEffortOptions,
  parseEffort,
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
  get description() {
    return I18nManager.getInstance().t(
      '选择推理强度，提供六个档位',
      'Choose one of six reasoning effort levels',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<void | SlashCommandActionReturn> => {
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

    const i18n = I18nManager.getInstance();
    const chosen = parseEffort(target);
    if (!chosen) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: i18n.t(
          '无效档位。请使用 /effort 选择推理强度。',
          'Invalid level. Use /effort to choose a reasoning effort.',
        ),
      });
      return;
    }

    mgr.setReasoningEffort(chosen);
    context.ui.addItem({
      type: MessageType.INFO,
      text: i18n.t(
        `推理强度已更新为：${getEffortOptions('zh').find((option) => option.level === chosen)?.label}`,
        `Reasoning effort updated: ${chosen}`,
      ),
    });
  },
  completion: async (_context: CommandContext, partial: string) => {
    const locale = I18nManager.getInstance().getLocale();
    return getEffortOptions(locale)
      .filter(
        (option) =>
          option.label.toLowerCase().startsWith(partial.toLowerCase()) ||
          option.level.startsWith(partial.toLowerCase()),
      )
      .map((option) => (locale === 'zh' ? option.label : option.level));
  },
};
