/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  I18nManager,
  readUltraRuntime,
  saveUltraRuntime,
  readDrillGrant,
} from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const redteamCommand: SlashCommand = {
  name: 'redteam',
  altNames: ['红队', '红队模式'],
  get description() {
    return I18nManager.getInstance().t(
      '配置已授权的红队工作流：/redteam on|off|status',
      'Configure authorized red-team workflow: /redteam on|off|status',
    );
  },
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const i18n = I18nManager.getInstance();
    const runtime = readUltraRuntime();
    const action = args.trim().toLowerCase();
    if (!action || ['status', '状态'].includes(action)) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: i18n.t(
          `红队工作流：${runtime.workflow === 'redteam' ? '开启' : '关闭'}；授权记录：${readDrillGrant().granted ? '已有' : '未登记'}\n/红队 on 开启，/红队 off 关闭；在演练台查看事实与工件。`,
          `Red-team workflow: ${runtime.workflow === 'redteam' ? 'on' : 'off'}; grant: ${readDrillGrant().granted ? 'recorded' : 'not recorded'}\n/redteam on|off; inspect evidence in /drill.`,
        ),
      });
      return;
    }
    if (!['on', 'off', '开启', '关闭'].includes(action)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: i18n.t(
          '用法：/红队 on|off|status',
          'Usage: /redteam on|off|status',
        ),
      });
      return;
    }
    const enable = ['on', '开启'].includes(action);
    if (enable && !readDrillGrant().granted) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: i18n.t(
          '请先在 /drill grant 登记演练授权与范围，再开启红队工作流。',
          'Record your drill authorization and scope with /drill grant before enabling the workflow.',
        ),
      });
      return;
    }
    saveUltraRuntime({ ...runtime, workflow: enable ? 'redteam' : 'general' });
    context.ui.addItem({
      type: MessageType.INFO,
      text: i18n.t(
        enable
          ? '红队工作流已开启：分析、证据归档、复核。'
          : '已恢复通用工作流。',
        enable
          ? 'Red-team workflow enabled: analysis, evidence recording and review.'
          : 'General workflow restored.',
      ),
    });
  },
  completion: async (_context, partial) =>
    ['on', 'off', 'status'].filter((value) => value.startsWith(partial)),
};
