/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { UiLocale } from '@google/gemini-cli-core';

const states: Record<string, string> = {
  scoping: '需求对齐中',
  ready: '已就绪',
  running: '运行中',
  active: '进行中',
  blocked: '已受阻',
  completed: '已完成',
  cancelled: '已取消',
  queued: '排队',
  working: '工作中',
  waiting: '等待',
  paused: '已暂停',
  killed: '已停止',
};

export function agentTaskStateLabel(state: string, locale: UiLocale): string {
  return locale === 'zh' ? (states[state] ?? state) : state;
}

export function agentTaskStageLabel(stage: string, locale: UiLocale): string {
  if (locale !== 'zh') return stage;
  if (stage === 'completed') return states['completed'];
  if (stage === 'final audit') return '最终独立复核';
  const match = /^(investigate|implement|review) (\d+\.\d+)$/.exec(stage);
  if (!match) return stage;
  const stages: Record<string, string> = {
    investigate: '调查',
    implement: '实施',
    review: '独立复核',
  };
  return `${stages[match[1]]} ${match[2]}`;
}

export function agentTaskModelLabel(
  model: string | undefined,
  locale: UiLocale,
): string {
  return !model || model === 'inherit'
    ? locale === 'zh'
      ? '继承主模型'
      : 'inherit'
    : model;
}

export function agentRoleModelsText(
  models: Record<string, string | undefined>,
  locale: UiLocale,
): string {
  const roles: Record<string, string> = {
    researcher: '研究员',
    coder: '开发员',
    'workflow-auditor': '独立复核员',
    'redteam-analyst': '红队分析员',
  };
  return (
    Object.entries(models)
      .map(
        ([role, model]) =>
          `${locale === 'zh' ? (roles[role] ?? role) : role}: ${agentTaskModelLabel(model, locale)}`,
      )
      .join(' · ') || agentTaskModelLabel(undefined, locale)
  );
}
