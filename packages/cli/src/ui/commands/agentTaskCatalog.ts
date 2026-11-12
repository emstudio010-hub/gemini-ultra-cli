/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  I18nManager,
  listAgentTasks,
  type AgentWorkflowMode,
} from '@google/gemini-cli-core';
import stripAnsi from 'strip-ansi';
import { agentTaskStateLabel } from '../utils/agentTaskLabels.js';

export function agentTaskCatalogText(
  root: string,
  args: string,
  command: AgentWorkflowMode | 'swarm',
): string {
  const i18n = I18nManager.getInstance();
  const value = args.trim();
  if (value && !/^[1-9]\d{0,5}$/.test(value))
    throw new Error(
      i18n.t(
        `用法：/${command} list [页码]，页码应为正整数。`,
        `Usage: /${command} list [page], with a positive integer page number.`,
      ),
    );
  const catalog = listAgentTasks(root, value ? Number(value) : 1);
  let text = i18n.t(
    `当前项目 Agent 任务 · 第 ${catalog.page} 页 · 共 ${catalog.total} 项`,
    `Agent tasks in this project · page ${catalog.page} · ${catalog.total} total`,
  );
  if (!catalog.entries.length)
    return text + '\n' + i18n.t('此页没有任务。', 'No tasks on this page.');
  for (const entry of catalog.entries) {
    const phase = entry.phase
      ? agentTaskStateLabel(entry.phase, i18n.getLocale())
      : i18n.t('详情未加载', 'details unavailable');
    text += `\n\n[${entry.mode}] ${phase} · ${entry.id}\n${i18n.t('保存时间', 'Saved')}: ${entry.savedAt}`;
    if (entry.objective)
      text +=
        '\n' + stripAnsi(entry.objective).replace(/\s+/g, ' ').slice(0, 180);
    if (entry.detailsUnavailable)
      text +=
        '\n' +
        i18n.t(
          '记录不可读取或超出本页读取上限；原文件保留，未更改活动任务。',
          "Record unreadable or outside this page's read limit; original retained and active task unchanged.",
        );
    else
      text += `\n/${entry.mode} status ${entry.id} · /${entry.mode} reports ${entry.id}`;
  }
  if (catalog.hasMore)
    text +=
      '\n\n' +
      i18n.t(
        `下一页：/${command} list ${catalog.page + 1}`,
        `Next page: /${command} list ${catalog.page + 1}`,
      );
  return text;
}
