/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nManager } from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const langCommand: SlashCommand = {
  name: 'lang',
  altNames: ['语言', '切换语言', 'language'],
  description: '切换界面语言 (Switch UI language): /lang [zh|en]',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const i18n = I18nManager.getInstance();
    const arg = args.trim().toLowerCase();

    let target: 'zh' | 'en';
    if (arg === 'zh' || arg === '中文' || arg === 'cn') {
      target = 'zh';
    } else if (arg === 'en' || arg === 'english') {
      target = 'en';
    } else {
      target = i18n.toggleLocale();
    }

    i18n.setLocale(target);
    context.ui.addItem({
      type: MessageType.INFO,
      text:
        target === 'zh'
          ? '✓ 界面语言已切换为: 简体中文 (可在 /provider 等界面直接体现)'
          : '✓ UI language switched to: English',
    });
  },
  completion: async () => ['zh', 'en', '中文', 'English'],
};
