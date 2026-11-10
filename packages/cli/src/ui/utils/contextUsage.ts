/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { tokenLimit, type ContentGenerator } from '@google/gemini-cli-core';

export function getContextUsagePercentage(
  promptTokenCount: number,
  model: string | undefined,
  generator?: Pick<ContentGenerator, 'getModelContextWindow'>,
): number {
  if (!model || typeof model !== 'string' || model.length === 0) {
    return 0;
  }
  const limit = tokenLimit(model, generator);
  if (limit <= 0) {
    return 0;
  }
  return promptTokenCount / limit;
}

export function isContextUsageHigh(
  promptTokenCount: number,
  model: string | undefined,
  threshold = 0.6,
  generator?: Pick<ContentGenerator, 'getModelContextWindow'>,
): boolean {
  return (
    getContextUsagePercentage(promptTokenCount, model, generator) > threshold
  );
}
