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
  if (stage === 'final audit file check') return '最终文件核对';
  const match = /^(investigate|implement|review) (\d+\.\d+)$/.exec(stage);
  if (!match) return agentTaskDiagnosticLabel(stage, locale);
  const stages: Record<string, string> = {
    investigate: '调查',
    implement: '实施',
    review: '独立复核',
  };
  return `${stages[match[1]]} ${match[2]}`;
}

export function agentTaskDiagnosticLabel(
  message: string,
  locale: UiLocale,
): string {
  if (locale !== 'zh') return message;
  const messages: Record<string, string> = {
    'Declared final review files changed or became unavailable during audit. Raw audit output is retained; explicitly resume only after inspecting the current artifacts.':
      '最终审核期间文件发生变化或不可读取。已保留审核原文，请检查当前文件后显式续接。',
    'Reviewed files changed or became unavailable during independent review. Raw reviewer output is retained; inspect the current files before a new review.':
      '独立复核期间文件发生变化或不可读取。已保留复核原文，请检查当前文件后重新复核。',
    'Isolated files changed during independent review; inspect the current worktree again.':
      '独立复核期间隔离文件发生变化，请重新检查当前工作树。',
    'This saved auditor requires explicit review_files before resuming. Assign its deliverable file list, or [] only for member-report-only tasks, then explicitly @mention it.':
      '此旧复核员尚未声明文件范围。请由协调者明确交付文件清单；仅成员报告任务可用空清单，然后显式 @提及该复核员。',
  };
  return messages[message] ?? message;
}

/** Describe saved metadata only; rendering must never re-read or approve artifacts. */
export function agentReviewScopeText(
  scope: { reviewFiles?: string[]; reviewedFiles?: unknown },
  locale: UiLocale,
  compact = false,
): string {
  const zh = locale === 'zh';
  const files = scope.reviewFiles;
  const heading =
    files === undefined
      ? zh
        ? '复核范围：未声明（执行或续接前需明确）'
        : 'Review scope: undeclared (declare before execution or resume)'
      : files.length === 0
        ? zh
          ? '复核范围：仅成员报告，不含工作区文件'
          : 'Review scope: member reports only, no workspace files'
        : `${zh ? `复核范围：${files.length} 个文件` : `Review scope: ${files.length} ${files.length === 1 ? 'file' : 'files'}`} · ${JSON.stringify(compact ? files.slice(0, 2) : files)}${compact && files.length > 2 ? (zh ? `，另 ${files.length - 2} 个` : `, +${files.length - 2} more`) : ''}`;
  const snapshot = scope.reviewedFiles
    ? compact
      ? zh
        ? '快照已保存'
        : 'snapshot saved'
      : zh
        ? '复核快照：已保存（历史记录，未重新核对当前文件）'
        : 'Review snapshot: saved (historical; current files were not rechecked)'
    : zh
      ? '复核快照：尚未保存'
      : 'Review snapshot: not saved';
  return `${heading}${compact ? ' · ' : '\n'}${snapshot}`;
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
