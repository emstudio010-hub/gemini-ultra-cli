/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useLocale } from '../hooks/useLocale.js';
import { formatDuration } from '../utils/formatters.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import type { ToolCallStats } from '@google/gemini-cli-core';

const TOOL_NAME_COL_WIDTH = 25;
const CALLS_COL_WIDTH = 8;
const SUCCESS_RATE_COL_WIDTH = 15;
const AVG_DURATION_COL_WIDTH = 15;

const StatRow: React.FC<{
  name: string;
  stats: ToolCallStats;
}> = ({ name, stats }) => {
  const successRate = stats.count > 0 ? (stats.success / stats.count) * 100 : 0;
  const avgDuration = stats.count > 0 ? stats.durationMs / stats.count : 0;
  const successColor = getStatusColor(successRate, {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  });

  return (
    <Box>
      <Box width={TOOL_NAME_COL_WIDTH}>
        <Text color={theme.text.link}>{name}</Text>
      </Box>
      <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.primary}>{stats.count}</Text>
      </Box>
      <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
        <Text color={successColor}>{successRate.toFixed(1)}%</Text>
      </Box>
      <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.primary}>{formatDuration(avgDuration)}</Text>
      </Box>
    </Box>
  );
};

export const ToolStatsDisplay: React.FC = () => {
  const chinese = useLocale() === 'zh';
  const t = (zh: string, en: string) => (chinese ? zh : en);
  const { stats } = useSessionStats();
  const { tools } = stats.metrics;
  const activeTools = Object.entries(tools.byName).filter(
    ([, metrics]) => metrics.count > 0,
  );

  if (activeTools.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingTop={1}
        paddingX={2}
      >
        <Text color={theme.text.primary}>
          {t(
            '本会话尚未调用工具。',
            'No tool calls have been made in this session.',
          )}
        </Text>
      </Box>
    );
  }

  const totalDecisions = Object.values(tools.byName).reduce(
    (acc, tool) => {
      acc.accept += tool.decisions.accept;
      acc.reject += tool.decisions.reject;
      acc.modify += tool.decisions.modify;
      return acc;
    },
    { accept: 0, reject: 0, modify: 0 },
  );

  const totalReviewed =
    totalDecisions.accept + totalDecisions.reject + totalDecisions.modify;
  const agreementRate =
    totalReviewed > 0 ? (totalDecisions.accept / totalReviewed) * 100 : 0;
  const agreementColor = getStatusColor(agreementRate, {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  });

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      width={70}
    >
      <Text bold color={theme.text.accent}>
        {t('工具详细统计', 'Tool Stats For Nerds')}
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={TOOL_NAME_COL_WIDTH}>
          <Text bold color={theme.text.primary}>
            {t('工具名称', 'Tool Name')}
          </Text>
        </Box>
        <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            {t('调用次数', 'Calls')}
          </Text>
        </Box>
        <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            {t('成功率', 'Success Rate')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            {t('平均耗时', 'Avg Duration')}
          </Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      {/* Tool Rows */}
      {activeTools.map(([name, stats]) => (
        <StatRow key={name} name={name} stats={stats} />
      ))}

      <Box height={1} />

      {/* User Decision Summary */}
      <Text bold color={theme.text.primary}>
        {t('用户决策汇总', 'User Decision Summary')}
      </Text>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={theme.text.link}>
            {t('已审核建议总数：', 'Total Reviewed Suggestions:')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={theme.text.primary}>{totalReviewed}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={theme.text.primary}>
            {t(' » 已接受：', ' » Accepted:')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={theme.status.success}>{totalDecisions.accept}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={theme.text.primary}>
            {t(' » 已拒绝：', ' » Rejected:')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={theme.status.error}>{totalDecisions.reject}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={theme.text.primary}>
            {t(' » 已修改：', ' » Modified:')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={theme.status.warning}>{totalDecisions.modify}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={theme.text.primary}>
            {t(' 总体同意率：', ' Overall Agreement Rate:')}
          </Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={totalReviewed > 0 ? agreementColor : undefined}>
            {totalReviewed > 0 ? `${agreementRate.toFixed(1)}%` : '--'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
