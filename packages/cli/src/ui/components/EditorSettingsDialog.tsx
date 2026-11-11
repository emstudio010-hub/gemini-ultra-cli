/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  editorSettingsManager,
  type EditorDisplay,
} from '../editors/editorSettingsManager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import {
  SettingScope,
  type LoadableSettingScope,
  type LoadedSettings,
} from '../../config/settings.js';
import {
  type EditorType,
  EDITOR_DISPLAY_NAMES,
  coreEvents,
  I18nManager,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';

interface EditorDialogProps {
  onSelect: (
    editorType: EditorType | undefined,
    scope: LoadableSettingScope,
  ) => void;
  settings: LoadedSettings;
  onExit: () => void;
}

export function EditorSettingsDialog({
  onSelect,
  settings,
  onExit,
}: EditorDialogProps): React.JSX.Element {
  const i18n = I18nManager.getInstance();
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );
  const [focusedSection, setFocusedSection] = useState<'editor' | 'scope'>(
    'editor',
  );
  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setFocusedSection((prev) => (prev === 'editor' ? 'scope' : 'editor'));
        return true;
      }
      if (key.name === 'escape') {
        onExit();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  const [editorItems, setEditorItems] = useState<EditorDisplay[]>([]);
  const [loadingEditors, setLoadingEditors] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    editorSettingsManager.getAvailableEditorDisplays(controller.signal).then(
      (items) => {
        if (active) {
          setEditorItems(items);
          setLoadingEditors(false);
        }
      },
      () => {
        if (active) {
          setLoadingEditors(false);
          coreEvents.emitFeedback(
            'error',
            i18n.t(
              '无法检测编辑器，请稍后重试。',
              'Could not detect editors. Please try again.',
            ),
          );
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [i18n]);

  const currentPreference =
    settings.forScope(selectedScope).settings.general?.preferredEditor;
  let editorIndex = currentPreference
    ? editorItems.findIndex(
        (item: EditorDisplay) => item.type === currentPreference,
      )
    : 0;
  const isUnsupportedEditor =
    !loadingEditors && editorItems.length > 0 && editorIndex === -1;
  if (isUnsupportedEditor) {
    editorIndex = 0;
  }

  useEffect(() => {
    if (isUnsupportedEditor && currentPreference) {
      coreEvents.emitFeedback(
        'error',
        `Editor is not supported: ${currentPreference}`,
      );
    }
  }, [isUnsupportedEditor, currentPreference]);

  const scopeItems: Array<{
    label: string;
    value: LoadableSettingScope;
    key: string;
  }> = [
    {
      label: 'User Settings',
      value: SettingScope.User,
      key: SettingScope.User,
    },
    {
      label: 'Workspace Settings',
      value: SettingScope.Workspace,
      key: SettingScope.Workspace,
    },
  ];

  const handleEditorSelect = (editorType: EditorType | 'not_set') => {
    if (editorType === 'not_set') {
      onSelect(undefined, selectedScope);
      return;
    }
    onSelect(editorType, selectedScope);
  };

  const handleScopeSelect = (scope: LoadableSettingScope) => {
    setSelectedScope(scope);
    setFocusedSection('editor');
  };

  let otherScopeModifiedMessage = '';
  const otherScope =
    selectedScope === SettingScope.User
      ? SettingScope.Workspace
      : SettingScope.User;
  if (
    settings.forScope(otherScope).settings.general?.preferredEditor !==
    undefined
  ) {
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.general?.preferredEditor !==
      undefined
        ? `(Also modified in ${otherScope})`
        : `(Modified in ${otherScope})`;
  }

  let mergedEditorName = 'None';
  if (
    settings.merged.general.preferredEditor &&
    editorItems.some(
      (item) =>
        item.type === settings.merged.general.preferredEditor && !item.disabled,
    )
  ) {
    mergedEditorName =
      EDITOR_DISPLAY_NAMES[settings.merged.general.preferredEditor];
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="row"
      padding={1}
      width="100%"
    >
      <Box flexDirection="column" width="45%" paddingRight={2}>
        <Text bold={focusedSection === 'editor'}>
          {focusedSection === 'editor' ? '> ' : '  '}Select Editor{' '}
          <Text color={theme.text.secondary}>{otherScopeModifiedMessage}</Text>
        </Text>
        {loadingEditors ? (
          <Text>
            {i18n.t('正在检测可用编辑器…', 'Checking available editors…')}
          </Text>
        ) : (
          <RadioButtonSelect
            items={editorItems.map((item) => ({
              label: item.name,
              value: item.type,
              disabled: item.disabled,
              key: item.type,
            }))}
            initialIndex={editorIndex}
            onSelect={handleEditorSelect}
            isFocused={focusedSection === 'editor'}
            priority={true}
            key={selectedScope}
            maxItemsToShow={editorItems.length}
          />
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusedSection === 'scope'}>
            {focusedSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0}
            onSelect={handleScopeSelect}
            isFocused={focusedSection === 'scope'}
            priority={true}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select, Tab to change focus, Esc to close)
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" width="55%" paddingLeft={2}>
        <Text bold color={theme.text.primary}>
          Editor Preference
        </Text>
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text color={theme.text.secondary}>
            These editors are currently supported. Please note that some editors
            cannot be used in sandbox mode.
          </Text>
          <Text color={theme.text.secondary}>
            Your preferred editor is:{' '}
            <Text
              color={
                mergedEditorName === 'None'
                  ? theme.status.error
                  : theme.text.link
              }
              bold
            >
              {mergedEditorName}
            </Text>
            .
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
