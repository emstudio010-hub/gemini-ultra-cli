/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import {
  getUsedStatusColor,
  QUOTA_USED_WARNING_THRESHOLD,
  QUOTA_USED_CRITICAL_THRESHOLD,
} from '../utils/displayUtils.js';
import { useLocale } from '../hooks/useLocale.js';
import { getQuotaUsage, quotaSummary } from '../utils/quotaDisplay.js';

interface QuotaDisplayProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  terse?: boolean;
  forceShow?: boolean;
  lowercase?: boolean;
}

export const QuotaDisplay: React.FC<QuotaDisplayProps> = ({
  remaining,
  limit,
  resetTime,
  terse = false,
  forceShow = false,
  lowercase = false,
}) => {
  const locale = useLocale();
  const usage = getQuotaUsage(remaining, limit);
  if (!usage) {
    return null;
  }

  const { usedPercentage } = usage;

  if (!forceShow && usedPercentage < QUOTA_USED_WARNING_THRESHOLD) {
    return null;
  }

  const color = getUsedStatusColor(usedPercentage, {
    warning: QUOTA_USED_WARNING_THRESHOLD,
    critical: QUOTA_USED_CRITICAL_THRESHOLD,
  });

  let text = quotaSummary(usage, resetTime, locale, terse);

  if (lowercase) {
    text = text.toLowerCase();
  }

  return <Text color={color}>{text}</Text>;
};
