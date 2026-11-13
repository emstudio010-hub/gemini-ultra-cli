/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { isWindows } from '@google/gemini-cli-core';
import { useLocale } from '../hooks/useLocale.js';
import { sessionResumeCommands } from '../utils/sessionResume.js';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const config = useConfig();
  const chinese = useLocale() === 'zh';
  const t = (zh: string, en: string) => (chinese ? zh : en);

  const worktreeSettings = config.getWorktreeSettings();

  const commands = sessionResumeCommands(
    stats.sessionId,
    worktreeSettings?.path,
    isWindows(),
  );
  let footer = `${t('恢复此会话：', 'To resume this session:')} ${commands.resume}`;

  if (commands.resumeWorktree && commands.removeWorktree) {
    footer =
      `${t('恢复此工作树中的会话：', 'To resume work in this worktree:')} ${commands.resumeWorktree}\n` +
      `${t('手动移除此工作树：', 'To remove manually:')} ${commands.removeWorktree}`;
  }

  return (
    <StatsDisplay
      title={t('会话已结束，再见！', 'Agent powering down. Goodbye!')}
      duration={duration}
      footer={footer}
    />
  );
};
