/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType, type HistoryItemHelp } from '../types.js';
import { getAntigravityInstallInfo } from '../utils/antigravityUtils.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altNames: ['帮助', '菜单', 'h'],
  kind: CommandKind.BUILT_IN,
  description: '显示所有可用命令、快捷键与使用帮助',
  autoExecute: true,
  action: async (context, args) => {
    const lowerArgs = args?.toLowerCase() || '';
    const hasAntigravity = lowerArgs.includes('antigravity');
    const hasInstallOrMigrate =
      lowerArgs.includes('install') || lowerArgs.includes('migrate');

    if (hasAntigravity && hasInstallOrMigrate) {
      const info = getAntigravityInstallInfo();

      if (info) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on ${info.platformName}, run the following command:\n\n'${info.installCmd}'`,
        });
      } else {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Learn more about Antigravity CLI at https://antigravity.google/docs/cli-getting-started`,
        });
      }
      return;
    }

    const helpItem: Omit<HistoryItemHelp, 'id'> = {
      type: MessageType.HELP,
      timestamp: new Date(),
    };

    context.ui.addItem(helpItem);
  },
};
