/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { CliSpinner } from '../components/CliSpinner.js';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useLocale } from '../hooks/useLocale.js';

interface AuthInProgressProps {
  onTimeout: () => void;
}

export function AuthInProgress({
  onTimeout,
}: AuthInProgressProps): React.JSX.Element {
  const [timedOut, setTimedOut] = useState(false);
  const locale = useLocale();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const timeoutCallback = useRef(onTimeout);
  useEffect(() => {
    timeoutCallback.current = onTimeout;
  }, [onTimeout]);

  useKeypress(
    (key) => {
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        onTimeout();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      timeoutCallback.current();
    }, 180000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {timedOut ? (
        <Text color={theme.status.error}>
          {t(
            '认证超时，请重试。',
            'Authentication timed out. Please try again.',
          )}
        </Text>
      ) : (
        <Box>
          <Text>
            <CliSpinner type="dots" />{' '}
            {t(
              '正在等待认证…（按 Esc 或 Ctrl+C 取消）',
              'Waiting for authentication... (Press Esc or Ctrl+C to cancel)',
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
}
