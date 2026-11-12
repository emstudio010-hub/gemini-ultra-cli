/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useLocale } from '../hooks/useLocale.js';
import { getQuotaUsage, quotaSummary } from '../utils/quotaDisplay.js';
import {
  getUsedStatusColor,
  QUOTA_USED_WARNING_THRESHOLD,
  QUOTA_USED_CRITICAL_THRESHOLD,
} from '../utils/displayUtils.js';

interface QuotaStatsInfoProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  showDetails?: boolean;
}

export const QuotaStatsInfo: React.FC<QuotaStatsInfoProps> = ({
  remaining,
  limit,
  resetTime,
  showDetails = true,
}) => {
  const locale = useLocale();
  const zh = locale === 'zh';
  const usage = getQuotaUsage(remaining, limit);
  if (!usage) {
    return null;
  }

  const { usedPercentage } = usage;
  const color = getUsedStatusColor(usedPercentage, {
    warning: QUOTA_USED_WARNING_THRESHOLD,
    critical: QUOTA_USED_CRITICAL_THRESHOLD,
  });

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      <Text color={color}>{quotaSummary(usage, resetTime, locale)}</Text>
      {showDetails && (
        <>
          <Text color={theme.text.primary}>
            {zh ? '用量上限：' : 'Usage limit: '}
            {usage.limit.toLocaleString(zh ? 'zh-CN' : 'en-US')}
          </Text>
          <Text color={theme.text.primary}>
            {zh
              ? '用量上限和重置时间以供应商返回的信息为准。'
              : 'Usage limits and reset times are reported by your provider.'}
          </Text>
          {remaining === 0 && (
            <Text color={theme.text.primary}>
              {zh
                ? '可用 /auth 检查登录状态或切换可用的账户与 API Key。'
                : 'Use /auth to review authentication or choose another available account or API key.'}
            </Text>
          )}
        </>
      )}
    </Box>
  );
};
