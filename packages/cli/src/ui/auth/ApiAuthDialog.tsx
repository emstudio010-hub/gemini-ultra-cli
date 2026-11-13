/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { debugLogger } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { KeypressPriority } from '../contexts/KeypressContext.js';
import { useLocale } from '../hooks/useLocale.js';

interface ApiAuthDialogProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  onClear: () => Promise<boolean>;
  error?: string | null;
  defaultValue?: string;
}

export function ApiAuthDialog({
  onSubmit,
  onCancel,
  onClear,
  error,
  defaultValue = '',
}: ApiAuthDialogProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const locale = useLocale();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const lifecycle = useRef({ mounted: true, clear: 0 }).current;
  useEffect(() => {
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      lifecycle.clear++;
    };
  }, [lifecycle]);

  const initialApiKey = defaultValue;

  const buffer = useTextBuffer({
    initialText: initialApiKey || '',
    initialCursorOffset: initialApiKey?.length || 0,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    inputFilter: (text) =>
      text.replace(/[^a-zA-Z0-9_.-]/g, '').replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const appliedDefault = useRef(defaultValue);
  const currentBuffer = useRef(buffer);
  currentBuffer.current = buffer;
  const edited = useRef(false);
  useEffect(() => {
    if (buffer.text !== appliedDefault.current) edited.current = true;
    if (defaultValue !== appliedDefault.current) {
      appliedDefault.current = defaultValue;
      if (!edited.current) buffer.setText(defaultValue);
    }
  }, [buffer, defaultValue]);

  const handleSubmit = (value: string) => {
    edited.current = true;
    lifecycle.clear++;
    onSubmit(value);
  };

  const handleClear = async () => {
    edited.current = true;
    const clear = ++lifecycle.clear;
    const priorText = buffer.text;
    try {
      const cleared = await onClear();
      if (
        cleared &&
        lifecycle.mounted &&
        lifecycle.clear === clear &&
        currentBuffer.current.text === priorText
      )
        currentBuffer.current.setText('');
    } catch {
      // The auth owner reports storage errors without exposing credential details.
      debugLogger.debug('API key clear did not complete.');
    }
  };

  useKeypress(
    (key) => {
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        void handleClear();
        return true;
      }
      return false;
    },
    { isActive: true, priority: KeypressPriority.Critical },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.ui.focus}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        {t('输入 Gemini API 密钥', 'Enter Gemini API Key')}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          {t(
            '请输入 Gemini API 密钥。密钥将通过本机凭据存储安全保存。',
            'Please enter your Gemini API key. It will be securely stored in your system keychain.',
          )}
        </Text>
        <Text color={theme.text.secondary}>
          {t('获取 API 密钥：', 'You can get an API key from ')}
          <Text color={theme.text.link}>
            https://aistudio.google.com/app/apikey
          </Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={buffer}
            onSubmit={handleSubmit}
            onCancel={() => {
              lifecycle.clear++;
              onCancel();
            }}
            placeholder={t('在此粘贴 API 密钥', 'Paste your API key here')}
          />
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {t(
            '（Enter 提交，Esc 取消，Ctrl+C 清除已保存的密钥）',
            '(Press Enter to submit, Esc to cancel, Ctrl+C to clear stored key)',
          )}
        </Text>
      </Box>
    </Box>
  );
}
