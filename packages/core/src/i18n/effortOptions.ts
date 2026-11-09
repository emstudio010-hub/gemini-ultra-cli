/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ReasoningEffortLevel } from '../providers/providerTypes.js';
import type { UiLocale } from './i18nManager.js';

const options: Array<{
  level: ReasoningEffortLevel;
  zh: string;
  en: string;
  zhDescription: string;
  enDescription: string;
}> = [
  {
    level: 'low',
    zh: '轻快',
    en: 'Low',
    zhDescription: '快速问答与小范围修正。',
    enDescription: 'Quick answers and small edits.',
  },
  {
    level: 'medium',
    zh: '均衡',
    en: 'Medium',
    zhDescription: '日常写作与标准编码任务。',
    enDescription: 'Everyday writing and coding.',
  },
  {
    level: 'high',
    zh: '深思',
    en: 'High',
    zhDescription: '深入理解上下文与边界条件。',
    enDescription: 'Deeper analysis of context and edge cases.',
  },
  {
    level: 'xhigh',
    zh: '极智',
    en: 'Extra high',
    zhDescription: '复杂问题与跨模块设计。',
    enDescription: 'Complex problems and cross-module design.',
  },
  {
    level: 'max',
    zh: '穷尽',
    en: 'Max',
    zhDescription: '增加分析预算，仔细比较方案。',
    enDescription: 'More analysis budget to compare approaches.',
  },
  {
    level: 'ultra',
    zh: '极尽详尽',
    en: 'Ultra',
    zhDescription: '深入拆解，按需协作；仅做必要验证。',
    enDescription:
      'Detailed decomposition and collaboration with focused validation.',
  },
];

export function getEffortOptions(locale: UiLocale) {
  return options.map((option) => ({
    level: option.level,
    label: option[locale],
    description: locale === 'zh' ? option.zhDescription : option.enDescription,
  }));
}

export function parseEffort(value: string): ReasoningEffortLevel | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === '终极' || normalized === '极尽') return 'ultra';
  return options.find((option) =>
    [option.level, option.zh, option.en.toLowerCase()].includes(normalized),
  )?.level;
}
