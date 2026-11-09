/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const shortcutsCommand: SlashCommand = {
  name: 'shortcuts',
  altNames: ['快捷键'],
  kind: CommandKind.BUILT_IN,
  description: '查看所有全局与编辑模式的键盘快捷键',
  autoExecute: true,
  action: (context) => {
    context.ui.toggleShortcutsHelp();
  },
};
