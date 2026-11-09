/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Text } from 'ink';
import { I18nManager } from '@google/gemini-cli-core';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useLocale } from '../hooks/useLocale.js';

export function LanguageDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  useKeypress(
    (key) => {
      if (key.name === 'escape') onClose();
    },
    { isActive: true },
  );
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{locale === 'zh' ? '界面语言' : 'Interface language'}</Text>
      <RadioButtonSelect
        items={[
          { key: 'zh', label: '中文', value: 'zh' },
          { key: 'en', label: 'English', value: 'en' },
        ]}
        initialIndex={locale === 'zh' ? 0 : 1}
        onSelect={(value) => {
          I18nManager.getInstance().setLocale(value === 'zh' ? 'zh' : 'en');
          onClose();
        }}
      />
    </Box>
  );
}
