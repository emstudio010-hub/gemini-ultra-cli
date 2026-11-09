/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type OpenDialogActionReturn,
  type SlashCommand,
} from './types.js';

export const themeCommand: SlashCommand = {
  name: 'theme',
  altNames: ['主题', '配色'],
  description: '切换终端 UI 颜色主题 (支持 Dark, Tokyo Night, Light, No Color 等)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'theme',
  }),
};
