/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type {
  HistoryItemStats,
  HistoryItemModelStats,
  HistoryItemToolStats,
  HistoryItemHeatmapStats,
} from '../types.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  UserAccountManager,
  getG1CreditBalance,
  aggregateUsageFromRecordings,
  DEFAULT_HEATMAP_WINDOW_DAYS,
  formatLocalDateKey,
  resolveHeatmapDateArg,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

function getUserIdentity(context: CommandContext) {
  const selectedAuthType =
    context.services.settings.merged.security.auth.selectedType || '';

  const userAccountManager = new UserAccountManager();
  const cachedAccount = userAccountManager.getCachedGoogleAccount();
  const userEmail = cachedAccount ?? undefined;

  const tier = context.services.agentContext?.config.getUserTierName();
  const paidTier = context.services.agentContext?.config.getUserPaidTier();
  const creditBalance = getG1CreditBalance(paidTier) ?? undefined;

  return { selectedAuthType, userEmail, tier, creditBalance };
}

function defaultSessionView(context: CommandContext) {
  const now = new Date();
  const { sessionStartTime } = context.session.stats;
  if (!sessionStartTime) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Session start time is unavailable, cannot calculate stats.',
    });
    return;
  }
  const wallDuration = now.getTime() - sessionStartTime.getTime();

  const { selectedAuthType, userEmail, tier, creditBalance } =
    getUserIdentity(context);
  const currentModel = context.services.agentContext?.config.getModel();

  const statsItem: HistoryItemStats = {
    type: MessageType.STATS,
    duration: formatDuration(wallDuration),
    selectedAuthType,
    userEmail,
    tier,
    currentModel,
    creditBalance,
  };

  if (context.services.agentContext?.config) {
    // Statistics are a local snapshot. Optional account refresh must not hold
    // the command open or replace the credit snapshot captured above.
    const quota = context.services.agentContext.config.getLastRetrievedQuota();
    if (quota) {
      statsItem.quotas = quota;
      statsItem.pooledRemaining =
        context.services.agentContext.config.getQuotaRemaining();
      statsItem.pooledLimit =
        context.services.agentContext.config.getQuotaLimit();
      statsItem.pooledResetTime =
        context.services.agentContext.config.getQuotaResetTime();
    }
  }

  context.ui.addItem(statsItem);
}

async function heatmapView(context: CommandContext, rawArgs: string) {
  const now = new Date();
  const parsedDate = resolveHeatmapDateArg(rawArgs, now);
  if (!parsedDate.ok) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: parsedDate.error,
    });
    return;
  }

  let chatsDir = '';
  try {
    const projectTempDir =
      context.services.agentContext?.config?.storage?.getProjectTempDir();
    if (projectTempDir) {
      chatsDir = path.join(projectTempDir, 'chats');
    }
  } catch {
    chatsDir = '';
  }

  const dataset = await aggregateUsageFromRecordings(
    chatsDir,
    DEFAULT_HEATMAP_WINDOW_DAYS,
    now,
  );

  const heatmapItem: HistoryItemHeatmapStats = {
    type: MessageType.HEATMAP_STATS,
    dailyUsage: Object.fromEntries(dataset.dailyUsage),
    totalWindowTokens: dataset.totalWindowTokens,
    totalWindowSessions: dataset.totalWindowSessions,
    totalWindowTurns: dataset.totalWindowTurns,
    currentStreak: dataset.currentStreak,
    longestStreak: dataset.longestStreak,
    today: formatLocalDateKey(now),
    selectedDate: parsedDate.date,
  };

  context.ui.addItem(heatmapItem);
}

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['统计', '用量', '消耗'],
  description: '查看当前会话的 Token 消耗、工具调用频次与响应耗时统计',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  action: async (context: CommandContext, args?: string) => {
    const trimmed = (args ?? '').trim();
    if (trimmed === 'heatmap' || trimmed.startsWith('heatmap ')) {
      await heatmapView(context, trimmed.slice('heatmap'.length));
      return;
    }
    defaultSessionView(context);
  },
  subCommands: [
    {
      name: 'session',
      description: 'Show session-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        defaultSessionView(context);
      },
    },
    {
      name: 'model',
      description: 'Show model-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const { selectedAuthType, userEmail, tier } = getUserIdentity(context);
        const currentModel = context.services.agentContext?.config.getModel();
        const pooledRemaining =
          context.services.agentContext?.config.getQuotaRemaining();
        const pooledLimit =
          context.services.agentContext?.config.getQuotaLimit();
        const pooledResetTime =
          context.services.agentContext?.config.getQuotaResetTime();
        context.ui.addItem({
          type: MessageType.MODEL_STATS,
          selectedAuthType,
          userEmail,
          tier,
          currentModel,
          pooledRemaining,
          pooledLimit,
          pooledResetTime,
        } as HistoryItemModelStats);
      },
    },
    {
      name: 'tools',
      description: 'Show tool-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.TOOL_STATS,
        } as HistoryItemToolStats);
      },
    },
    {
      name: 'heatmap',
      description:
        'Show calendar heatmap of daily token usage. Usage: /stats heatmap [today|yesterday|YYYY-MM-DD]',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      showCompletionLoading: false,
      completion: (_context: CommandContext, partialArg: string) => {
        const prefix = partialArg.trim().toLowerCase();
        return ['today', 'yesterday'].filter((opt) => opt.startsWith(prefix));
      },
      action: async (context: CommandContext, args: string) => {
        await heatmapView(context, args);
      },
    },
  ],
};
