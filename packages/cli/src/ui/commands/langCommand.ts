/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nManager } from '@google/gemini-cli-core';
import { createElement } from 'react';
import { LanguageDialog } from '../components/LanguageDialog.js';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';

export const langCommand: SlashCommand = {
  name: 'language',
  altNames: ['lang', '语言', '切换语言'],
  get description() {
    return I18nManager.getInstance().t(
      '切换界面语言：/language 中文 或 /language 英文',
      'Choose interface language: /language zh or /language en',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<void | SlashCommandActionReturn> => {
    const i18n = I18nManager.getInstance();
    const arg = args.trim().toLowerCase();
    if (!arg)
      return {
        type: 'custom_dialog' as const,
        component: createElement(LanguageDialog, {
          onClose: () => context.ui.removeComponent(),
        }),
      };

    let target: 'zh' | 'en';
    if (arg === 'zh' || arg === '中文' || arg === 'cn') {
      target = 'zh';
    } else if (
      arg === 'en' ||
      arg === 'english' ||
      arg === '英文' ||
      arg === '英语'
    ) {
      target = 'en';
    } else {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: i18n.t(
          '请选择中文或英文。用法：/language 中文|英文',
          'Choose zh or en. Usage: /language zh|en',
        ),
      });
      return;
    }

    i18n.setLocale(target);
    context.ui.reloadCommands();
    context.ui.addItem({
      type: MessageType.INFO,
      text:
        target === 'zh'
          ? '界面语言已切换为中文。'
          : 'Interface language switched to English.',
    });
  },
  completion: async (_context, partial) =>
    (I18nManager.getInstance().getLocale() === 'zh'
      ? ['中文', '英文']
      : ['zh', 'en']
    ).filter((value) => value.startsWith(partial.toLowerCase())),
};
