/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FC } from 'react';
import { Box, Text } from 'ink';
import { ProviderManager, getEffortOptions } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { useLocale } from '../hooks/useLocale.js';
import { effortSaveError } from '../utils/effortSaveError.js';

interface EffortDialogProps {
  onClose: () => void;
}

export const EffortDialog: FC<EffortDialogProps> = ({ onClose }) => {
  const locale = useLocale();
  const EFFORT_OPTIONS = getEffortOptions(locale);
  const mgr = ProviderManager.getInstance();
  const currentLevel = mgr.getReasoningEffort();

  const initialIdx = Math.max(
    0,
    EFFORT_OPTIONS.findIndex((o) => o.level === currentLevel),
  );
  const [selectedIdx, setSelectedIdx] = useState(initialIdx);
  const [saveError, setSaveError] = useState('');

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'up') {
        setSelectedIdx((prev) =>
          prev > 0 ? prev - 1 : EFFORT_OPTIONS.length - 1,
        );
        return true;
      }
      if (key.name === 'down') {
        setSelectedIdx((prev) =>
          prev < EFFORT_OPTIONS.length - 1 ? prev + 1 : 0,
        );
        return true;
      }
      if (key.name === 'enter' || key.name === 'return') {
        const chosen = EFFORT_OPTIONS[selectedIdx];
        try {
          if (chosen) mgr.setReasoningEffort(chosen.level);
        } catch (error) {
          setSaveError(effortSaveError(error));
          return true;
        }
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          {locale === 'zh' ? '推理强度' : 'Reasoning effort'}
        </Text>
        <Text color={theme.text.secondary}>
          {locale === 'zh'
            ? '↑↓ 选择 · Enter 确认 · Esc 返回'
            : '↑↓ Select · Enter Confirm · Esc Back'}
        </Text>
      </Box>

      {saveError ? (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{saveError}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        {EFFORT_OPTIONS.map((opt, idx) => {
          const isSelected = idx === selectedIdx;
          const isCurrent = opt.level === currentLevel;
          return (
            <Box
              key={opt.level}
              flexDirection="column"
              marginTop={idx > 0 ? 1 : 0}
            >
              <Box flexDirection="row">
                <Text
                  color={isSelected ? theme.status.success : theme.text.primary}
                >
                  {isSelected ? ' ▶ ' : '   '}
                  <Text bold>{opt.label}</Text>
                  {isCurrent ? (
                    <Text color={theme.text.accent}>
                      {' '}
                      {locale === 'zh' ? '当前' : 'Current'}
                    </Text>
                  ) : null}
                </Text>
              </Box>
              <Box marginLeft={5}>
                <Text color={theme.text.secondary}>{opt.description}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
      >
        <Text color={theme.ui.comment}>
          {locale === 'zh'
            ? '实际推理预算取决于所选模型和端点支持。'
            : 'The effective reasoning budget depends on your model and endpoint.'}
        </Text>
      </Box>
    </Box>
  );
};
