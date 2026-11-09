/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  I18nManager,
  readUltraRuntime,
  saveUltraRuntime,
  listCollaborationTasks,
} from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const teamCommand: SlashCommand = {
  name: 'team',
  altNames: ['协作', '多代理'],
  description: 'Configure collaboration: /team auto|single|team [1-8]',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const i18n = I18nManager.getInstance();
    const runtime = readUltraRuntime();
    const [mode, count] = args.trim().toLowerCase().split(/\s+/);
    const modes = {
      auto: 'auto',
      自动: 'auto',
      single: 'single',
      单代理: 'single',
      team: 'team',
      多代理: 'team',
    } as const;
    if (!mode || mode === 'status' || mode === '状态') {
      const sessionId = context.services.agentContext?.config.getSessionId();
      context.ui.addItem({
        type: MessageType.INFO,
        text: i18n.t(
          `协作模式：${runtime.collaboration}；并发上限：${runtime.maxParallel}\n使用 /team auto|single|team [1-8] 设置。\n当前会话任务：${sessionId ? listCollaborationTasks(sessionId).length : 0}`,
          `Collaboration: ${runtime.collaboration}; concurrency: ${runtime.maxParallel}\nUse /team auto|single|team [1-8].\nSession tasks: ${sessionId ? listCollaborationTasks(sessionId).length : 0}`,
        ),
      });
      return;
    }
    const chosen = Object.entries(modes).find(([key]) => key === mode)?.[1];
    const parallel = count ? Number(count) : runtime.maxParallel;
    if (
      !chosen ||
      !Number.isInteger(parallel) ||
      parallel < 1 ||
      parallel > 8
    ) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: i18n.t(
          '用法：/team auto|single|team [1-8]',
          'Usage: /team auto|single|team [1-8]',
        ),
      });
      return;
    }
    saveUltraRuntime({
      ...runtime,
      collaboration: chosen,
      maxParallel: parallel,
    });
    context.ui.addItem({
      type: MessageType.INFO,
      text: i18n.t(
        '协作设置已保存，后续请求生效。',
        'Collaboration settings saved for subsequent requests.',
      ),
    });
  },
  completion: async (_context, partial) =>
    ['auto', 'single', 'team'].filter((value) => value.startsWith(partial)),
};
