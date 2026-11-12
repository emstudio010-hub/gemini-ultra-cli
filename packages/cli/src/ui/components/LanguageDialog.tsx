/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Text } from 'ink';
import { useState } from 'react';
import { I18nManager } from '@google/gemini-cli-core';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useLocale } from '../hooks/useLocale.js';
import { languageSaveError } from '../utils/languageSaveError.js';
import { theme } from '../semantic-colors.js';

export function LanguageDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const [saveError, setSaveError] = useState('');
  useKeypress(
    (key) => {
      if (key.name === 'escape') onClose();
    },
    { isActive: true },
  );
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{locale === 'zh' ? '界面语言' : 'Interface language'}</Text>
      {saveError ? (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{saveError}</Text>
        </Box>
      ) : null}
      <RadioButtonSelect
        items={[
          { key: 'zh', label: '中文', value: 'zh' },
          { key: 'en', label: 'English', value: 'en' },
        ]}
        initialIndex={locale === 'zh' ? 0 : 1}
        onSelect={(value) => {
          try {
            I18nManager.getInstance().setLocale(value === 'zh' ? 'zh' : 'en');
          } catch {
            setSaveError(languageSaveError());
            return;
          }
          onClose();
        }}
      />
    </Box>
  );
}
