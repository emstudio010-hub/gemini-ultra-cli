/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { normalizeEscapedNewlines } from '../../utils/textUtils.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
  isFirstThinking?: boolean;
}

const THINKING_LEFT_PADDING = 1;
const MAX_THOUGHT_LINES = 8;
const KEEP_TAIL_LINES = 4;
const MAX_THOUGHT_WIDTH = 120;

function normalizeThoughtLines(thought: ThoughtSummary): string[] {
  const subject = normalizeEscapedNewlines(thought.subject).trim();
  const description = normalizeEscapedNewlines(thought.description).trim();

  const isNoise = (text: string) => {
    const trimmed = text.trim();
    return !trimmed || /^\.+$/.test(trimmed);
  };

  const lines: string[] = [];

  if (subject && !isNoise(subject)) {
    lines.push(subject);
  }

  if (description) {
    const descriptionLines = description
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !isNoise(line));
    lines.push(...descriptionLines);
  }

  return lines;
}

/**
 * Renders a model's thought as a distinct bubble.
 * Leverages Ink layout for wrapping and borders.
 */
export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
  isFirstThinking,
}) => {
  const allLines = useMemo(() => normalizeThoughtLines(thought), [thought]);

  if (allLines.length === 0) {
    return null;
  }

  // Collapse very long thoughts to avoid terminal flicker: keep title + latest lines.
  const collapsed = allLines.length > MAX_THOUGHT_LINES;
  const fullLines = collapsed
    ? [allLines[0], ...allLines.slice(-KEEP_TAIL_LINES)]
    : allLines;
  const hiddenCount = collapsed ? allLines.length - 1 - KEEP_TAIL_LINES : 0;
  const boxWidth = Math.min(terminalWidth, MAX_THOUGHT_WIDTH);

  return (
    <Box width={terminalWidth} flexDirection="column">
      {isFirstThinking && (
        <Text color={theme.text.accent} italic>
          {' '}
          ✦ 思考中...{' '}
        </Text>
      )}

      <Box
        marginLeft={THINKING_LEFT_PADDING}
        width={boxWidth - THINKING_LEFT_PADDING}
        paddingX={1}
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
      >
        <Text color={theme.text.primary} bold italic>
          {fullLines[0]}
        </Text>
        {collapsed && (
          <Text color={theme.text.secondary} dimColor>
            … 已折叠前 {hiddenCount} 行思考过程 …
          </Text>
        )}
        {fullLines.slice(1).map((line, index) => (
          <Text key={`body-line-${index}`} color={theme.text.secondary} italic>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
