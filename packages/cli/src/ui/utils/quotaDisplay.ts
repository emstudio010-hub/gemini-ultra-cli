/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { UiLocale } from '@google/gemini-cli-core';
import { formatResetTime } from './formatters.js';

export function validQuotaFraction(value: number | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

export function getQuotaUsage(
  remaining: number | undefined,
  limit: number | undefined,
) {
  if (
    typeof remaining !== 'number' ||
    typeof limit !== 'number' ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    remaining < 0 ||
    remaining > limit
  )
    return undefined;
  return { remaining, limit, usedPercentage: 100 - (remaining / limit) * 100 };
}

export function quotaSummary(
  usage: NonNullable<ReturnType<typeof getQuotaUsage>>,
  resetTime: string | undefined,
  locale: UiLocale,
  terse = false,
): string {
  const reset = formatResetTime(resetTime, 'terse', locale);
  const zh = locale === 'zh';
  if (usage.remaining === 0) {
    const label = zh ? '已达用量上限' : 'Limit reached';
    return terse || !reset
      ? label
      : zh
        ? `${label}，${reset}后重置`
        : `${label}, resets in ${reset}`;
  }
  const percentage = `${usage.usedPercentage.toFixed(0)}%`;
  if (terse) return percentage;
  const label = zh ? `已用 ${percentage}` : `${percentage} used`;
  return !reset
    ? label
    : zh
      ? `${label}（${reset}后重置）`
      : `${label} (Limit resets in ${reset})`;
}
