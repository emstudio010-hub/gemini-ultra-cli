/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import {
  SettingScope,
  type LoadableSettingScope,
  type LoadedSettings,
} from '../../config/settings.js';
import {
  AuthType,
  clearCachedCredentialFile,
  type Config,
  debugLogger,
  ProviderManager,
  I18nManager,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { AuthState } from '../types.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { ProviderConfigDialog } from '../components/ProviderConfigDialog.js';
import { useLocale } from '../hooks/useLocale.js';

interface AuthDialogProps {
  config: Config;
  settings: LoadedSettings;
  setAuthState: (state: AuthState) => void;
  authError: string | null;
  onAuthError: (error: string | null) => void;
  setAuthContext: (context: { requiresRestart?: boolean }) => void;
}

export function AuthDialog({
  config,
  settings,
  setAuthState,
  authError,
  onAuthError,
  setAuthContext,
}: AuthDialogProps): React.JSX.Element {
  const [exiting, setExiting] = useState(false);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const lifecycle = useRef<{
    mounted: boolean;
    selection: number;
    restartTimer?: ReturnType<typeof setTimeout>;
  }>({ mounted: true, selection: 0 }).current;
  const invalidateSelection = useCallback(() => {
    lifecycle.selection++;
    clearTimeout(lifecycle.restartTimer);
    lifecycle.restartTimer = undefined;
  }, [lifecycle]);
  useEffect(() => {
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      invalidateSelection();
    };
  }, [lifecycle, invalidateSelection]);
  const locale = useLocale();
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  let items = [
    {
      label: t(
        '配置外接供应商（无需 Google 登录）',
        'Configure an external provider (no Google sign-in)',
      ),
      value: AuthType.GATEWAY,
      key: AuthType.GATEWAY,
    },
    {
      label: t('使用 Google 登录', 'Sign in with Google'),
      value: AuthType.LOGIN_WITH_GOOGLE,
      key: AuthType.LOGIN_WITH_GOOGLE,
    },
    ...(process.env['CLOUD_SHELL'] === 'true'
      ? [
          {
            label: 'Use Cloud Shell user credentials',
            value: AuthType.COMPUTE_ADC,
            key: AuthType.COMPUTE_ADC,
          },
        ]
      : process.env['GEMINI_CLI_USE_COMPUTE_ADC'] === 'true'
        ? [
            {
              label: 'Use metadata server application default credentials',
              value: AuthType.COMPUTE_ADC,
              key: AuthType.COMPUTE_ADC,
            },
          ]
        : []),
    {
      label: t('使用 Gemini API 密钥', 'Use Gemini API Key'),
      value: AuthType.USE_GEMINI,
      key: AuthType.USE_GEMINI,
    },
    {
      label: 'Vertex AI',
      value: AuthType.USE_VERTEX_AI,
      key: AuthType.USE_VERTEX_AI,
    },
  ];

  if (settings.merged.security.auth.enforcedType) {
    items = items.filter(
      (item) => item.value === settings.merged.security.auth.enforcedType,
    );
  }

  let defaultAuthType: AuthType | null = null;
  const defaultAuthTypeEnv = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
  if (
    defaultAuthTypeEnv &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    Object.values(AuthType).includes(defaultAuthTypeEnv as AuthType)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    defaultAuthType = defaultAuthTypeEnv as AuthType;
  }

  let initialAuthIndex = items.findIndex((item) => {
    if (settings.merged.security.auth.selectedType) {
      return item.value === settings.merged.security.auth.selectedType;
    }

    if (defaultAuthType) {
      return item.value === defaultAuthType;
    }

    if (process.env['GEMINI_API_KEY']) {
      return item.value === AuthType.USE_GEMINI;
    }

    return item.value === AuthType.GATEWAY;
  });
  if (settings.merged.security.auth.enforcedType) {
    initialAuthIndex = 0;
  }

  const onSelect = useCallback(
    async (
      authType: AuthType | undefined,
      scope: LoadableSettingScope,
      isCurrent: () => boolean,
    ) => {
      if (exiting || !isCurrent()) {
        return;
      }
      if (authType) {
        const needsRestart =
          authType === AuthType.LOGIN_WITH_GOOGLE ||
          (authType === AuthType.USE_VERTEX_AI &&
            process.env['CLOUD_SHELL'] === 'true');

        const currentAuthType = settings.merged.security?.auth?.selectedType;
        if (
          authType === AuthType.LOGIN_WITH_GOOGLE ||
          currentAuthType === AuthType.LOGIN_WITH_GOOGLE
        ) {
          try {
            await clearCachedCredentialFile();
          } catch (error) {
            if (!isCurrent()) return;
            debugLogger.error('Failed to clear cached credentials:', error);
            onAuthError(
              'Failed to clear cached credentials: ' +
                (error instanceof Error ? error.message : String(error)),
            );
            if (authType === AuthType.LOGIN_WITH_GOOGLE) {
              return;
            }
          }
        }

        if (!isCurrent()) return;
        if (
          authType !== AuthType.GATEWAY &&
          ProviderManager.getInstance().getActiveProvider()
        )
          ProviderManager.getInstance().setActiveSelection(undefined);
        setAuthContext(needsRestart ? { requiresRestart: true } : {});
        settings.setValue(scope, 'security.auth.selectedType', authType);
        if (
          authType === AuthType.LOGIN_WITH_GOOGLE &&
          config.isBrowserLaunchSuppressed()
        ) {
          setExiting(true);
          lifecycle.restartTimer = setTimeout(() => {
            if (!isCurrent()) return;
            lifecycle.restartTimer = undefined;
            void relaunchApp({ overrideAuthType: authType }).catch((err) => {
              if (!isCurrent()) return;
              debugLogger.error('Failed to trigger supervisor relaunch:', err);
              process.exit(1);
            });
          }, 100);
          return;
        }

        if (authType === AuthType.USE_GEMINI) {
          // Always show the API key input dialog so the user can
          // explicitly enter or confirm their key, regardless of
          // whether GEMINI_API_KEY env var or a stored key exists.
          setAuthState(AuthState.AwaitingApiKeyInput);
          return;
        }
      }
      setAuthState(AuthState.Unauthenticated);
    },
    [
      settings,
      config,
      setAuthState,
      exiting,
      setAuthContext,
      onAuthError,
      lifecycle,
    ],
  );

  const handleAuthSelect = async (authMethod: AuthType) => {
    if (exiting || !lifecycle.mounted) return;
    invalidateSelection();
    const selection = lifecycle.selection;
    const isCurrent = () =>
      lifecycle.mounted && lifecycle.selection === selection;
    if (authMethod === AuthType.GATEWAY) {
      setShowProviderForm(true);
      return;
    }
    const error = await validateAuthMethodWithSettings(
      authMethod,
      settings,
    ).catch((e) => (e instanceof Error ? e.message : String(e)));
    if (!isCurrent()) return;
    if (error) {
      onAuthError(error);
    } else {
      onAuthError(null);
      try {
        await onSelect(authMethod, SettingScope.User, isCurrent);
      } catch (e) {
        if (!isCurrent()) return;
        onAuthError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        invalidateSelection();
        const selection = lifecycle.selection;
        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (authError) {
          return true;
        }
        if (settings.merged.security.auth.selectedType === undefined) {
          // Prevent exiting if no auth method is set
          onAuthError(
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          );
          return true;
        }
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        onSelect(
          undefined,
          SettingScope.User,
          () => lifecycle.mounted && lifecycle.selection === selection,
        );
        return true;
      }
      return false;
    },
    { isActive: !showProviderForm && !exiting },
  );

  if (showProviderForm)
    return (
      <ProviderConfigDialog
        onClose={() => {
          if (!lifecycle.mounted) return;
          invalidateSelection();
          setShowProviderForm(false);
          const manager = ProviderManager.getInstance();
          const provider = manager.getActiveProvider();
          const model = manager.getActiveModel();
          if (!provider || !model) {
            onAuthError(
              I18nManager.getInstance().t(
                '请添加供应商并选择一个模型。',
                'Add a provider and select a model.',
              ),
            );
            return;
          }
          config.setModel(`${provider.id}:${model}`);
          settings.setValue(
            SettingScope.User,
            'security.auth.selectedType',
            AuthType.GATEWAY,
          );
          setAuthContext({});
          onAuthError(null);
          setAuthState(AuthState.Unauthenticated);
        }}
      />
    );

  if (exiting) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.ui.focus}
        flexDirection="row"
        padding={1}
        width="100%"
        alignItems="flex-start"
      >
        <Text color={theme.text.primary}>
          Logging in with Google... Restarting Gemini CLI to continue.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.ui.focus}
      flexDirection="row"
      padding={1}
      width="100%"
      alignItems="flex-start"
    >
      <Text color={theme.text.accent}>? </Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={theme.text.primary}>
          {t('开始使用', 'Get started')}
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            {t(
              '选择模型接入方式：',
              'How would you like to connect your model?',
            )}
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            initialIndex={initialAuthIndex}
            onSelect={handleAuthSelect}
            onHighlight={() => {
              invalidateSelection();
              onAuthError(null);
            }}
          />
        </Box>
        {authError && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>{authError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t('按 Enter 选择', 'Press Enter to select')}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Terms of Services and Privacy Notice for Gemini CLI
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.link}>
            {'https://geminicli.com/docs/resources/tos-privacy/'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
