/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type SetStateAction,
} from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  type Config,
  loadApiKey,
  saveApiKey,
  debugLogger,
  isAccountSuspendedError,
  ProjectIdRequiredError,
  ChangeAuthRequestedError,
  ValidationCancelledError,
  I18nManager,
  AuthRefreshSupersededError,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';

export async function validateAuthMethodWithSettings(
  authType: AuthType,
  settings: LoadedSettings,
): Promise<string | null> {
  const enforcedType = settings.merged.security.auth.enforcedType;
  if (enforcedType && enforcedType !== authType) {
    return `Authentication is enforced to be ${enforcedType}, but you are currently using ${authType}.`;
  }
  if (settings.merged.security.auth.useExternal) {
    return null;
  }
  // If using Gemini API key, we don't validate it here as we might need to prompt for it.
  if (authType === AuthType.USE_GEMINI) {
    return null;
  }
  return validateAuthMethod(authType);
}

import type { AccountSuspensionInfo } from '../contexts/UIStateContext.js';

export const useAuthCommand = (
  settings: LoadedSettings,
  config: Config,
  initialAuthError: string | null = null,
  initialAccountSuspensionInfo: AccountSuspensionInfo | null = null,
) => {
  const lifecycle = useRef<{
    authAttempt: number;
    keyRead: number;
    mounted: boolean;
    controller?: AbortController;
  }>({
    authAttempt: 0,
    keyRead: 0,
    mounted: true,
  }).current;
  const mayReuseInitialAuth = useRef(!initialAuthError);
  const keySaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [authState, setAuthStateValue] = useState<AuthState>(
    initialAuthError ? AuthState.Updating : AuthState.Unauthenticated,
  );
  const [authRevision, setAuthRevision] = useState(0);

  const [authError, setAuthError] = useState<string | null>(initialAuthError);
  const [accountSuspensionInfo, setAccountSuspensionInfo] =
    useState<AccountSuspensionInfo | null>(initialAccountSuspensionInfo);
  const [apiKeyDefaultValue, setApiKeyDefaultValue] = useState<
    string | undefined
  >(undefined);

  const cancelPendingAuth = useCallback(() => {
    const controller = lifecycle.controller;
    lifecycle.controller = undefined;
    controller?.abort(new AuthRefreshSupersededError());
  }, [lifecycle]);

  useEffect(() => {
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      lifecycle.authAttempt++;
      lifecycle.keyRead++;
      cancelPendingAuth();
    };
  }, [lifecycle, cancelPendingAuth]);

  const setAuthState = useCallback(
    (value: SetStateAction<AuthState>) => {
      // Invalidate synchronously: a completion can run before React cleans up
      // the old effect after a cancel, timeout, or explicit auth selection.
      lifecycle.authAttempt++;
      lifecycle.keyRead++;
      cancelPendingAuth();
      if (lifecycle.mounted) {
        setAuthRevision((revision) => revision + 1);
        setAuthStateValue(value);
      }
    },
    [lifecycle, cancelPendingAuth],
  );

  const onAuthError = useCallback(
    (error: string | null) => {
      setAuthError(error);
      if (error) {
        setAuthState(AuthState.Updating);
      }
    },
    [setAuthError, setAuthState],
  );

  const onKeyLoadError = useCallback(() => {
    onAuthError(
      I18nManager.getInstance().t(
        '无法读取已保存的 API 密钥。请重新输入密钥或选择其他认证方式。',
        'Could not load the saved API key. Re-enter it or choose another authentication method.',
      ),
    );
  }, [onAuthError]);

  const reloadApiKey = useCallback(
    async (isRelevant: () => boolean = () => true) => {
      const read = ++lifecycle.keyRead;
      const envKey = process.env['GEMINI_API_KEY'];
      const key = envKey !== undefined ? envKey : ((await loadApiKey()) ?? '');
      if (lifecycle.mounted && read === lifecycle.keyRead && isRelevant()) {
        setApiKeyDefaultValue(key);
      }
      return key;
    },
    [lifecycle],
  );

  const handleApiKeySubmit = useCallback(
    async (apiKey: string) => {
      if (!lifecycle.mounted || authState !== AuthState.AwaitingApiKeyInput)
        return;
      const attempt = ++lifecycle.authAttempt;
      lifecycle.keyRead++;
      cancelPendingAuth();
      const controller = new AbortController();
      lifecycle.controller = controller;
      const isCurrent = () =>
        lifecycle.mounted &&
        lifecycle.authAttempt === attempt &&
        !controller.signal.aborted &&
        settings.merged.security.auth.selectedType === AuthType.USE_GEMINI;
      let authenticating = false;
      try {
        if (!isCurrent()) return;
        setAuthError(null);
        if (!apiKey.trim()) {
          onAuthError(
            I18nManager.getInstance().t(
              'API 密钥不能为空或仅包含空白字符。',
              'API key cannot be empty or whitespace only.',
            ),
          );
          return;
        }
        // Credential storage cannot cancel an in-flight write. Serialize this
        // UI's writes so an older completion cannot overwrite a newer key.
        const save = keySaveQueue.current.then(async () => {
          if (isCurrent()) await saveApiKey(apiKey);
        });
        keySaveQueue.current = save.catch(() => undefined);
        await save;
        if (!isCurrent()) return;
        await reloadApiKey(isCurrent);
        if (!isCurrent()) return;
        authenticating = true;
        await config.refreshAuth(
          AuthType.USE_GEMINI,
          undefined,
          undefined,
          undefined,
          controller.signal,
        );
        if (!isCurrent()) return;
        // Core owns successful authentication and its subsequent polling.
        lifecycle.controller = undefined;
        setAuthState(AuthState.Authenticated);
      } catch (error) {
        if (!isCurrent() || error instanceof AuthRefreshSupersededError) return;
        onAuthError(
          authenticating
            ? I18nManager.getInstance().t(
                '密钥已保存，但认证未完成。请检查密钥、网络或选择其他认证方式。',
                'The key was saved, but sign-in did not complete. Check the key and network or choose another authentication method.',
              )
            : I18nManager.getInstance().t(
                '无法保存或读取 API 密钥。请重试或选择其他认证方式。',
                'Could not save or read the API key. Try again or choose another authentication method.',
              ),
        );
      } finally {
        if (lifecycle.controller === controller)
          lifecycle.controller = undefined;
      }
    },
    [
      lifecycle,
      authState,
      settings,
      cancelPendingAuth,
      onAuthError,
      reloadApiKey,
      config,
      setAuthState,
    ],
  );

  useEffect(() => {
    if (authState !== AuthState.AwaitingApiKeyInput) return;
    let active = true;
    void reloadApiKey(() => active).catch(() => {
      if (active && lifecycle.mounted) onKeyLoadError();
    });
    return () => {
      active = false;
    };
  }, [authState, reloadApiKey, onKeyLoadError, lifecycle]);

  useEffect(() => {
    if (authState !== AuthState.Unauthenticated) return;
    const attempt = ++lifecycle.authAttempt;
    const controller = new AbortController();
    lifecycle.controller = controller;
    let active = true;
    const authType = settings.merged.security.auth.selectedType;
    const isCurrent = () =>
      active &&
      lifecycle.mounted &&
      lifecycle.authAttempt === attempt &&
      settings.merged.security.auth.selectedType === authType;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const mayReuseReadyAuth = mayReuseInitialAuth.current;
      mayReuseInitialAuth.current = false;

      if (!authType) {
        if (process.env['GEMINI_API_KEY']) {
          onAuthError(
            'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.',
          );
        } else {
          onAuthError('No authentication method selected.');
        }
        return;
      }

      if (authType === AuthType.USE_GEMINI) {
        let key: string;
        try {
          key = await reloadApiKey(isCurrent);
        } catch {
          if (isCurrent()) onKeyLoadError();
          return;
        }
        if (!isCurrent()) return;
        if (!key) {
          setAuthState(AuthState.AwaitingApiKeyInput);
          return;
        }
      }

      const error = await validateAuthMethodWithSettings(
        authType,
        settings,
      ).catch((e: unknown) => getErrorMessage(e));
      if (!isCurrent()) return;

      if (error) {
        onAuthError(error);
        return;
      }

      const defaultAuthType = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
      if (
        defaultAuthType &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        !Object.values(AuthType).includes(defaultAuthType as AuthType)
      ) {
        onAuthError(
          `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${defaultAuthType}". ` +
            `Valid values are: ${Object.values(AuthType).join(', ')}.`,
        );
        return;
      }

      try {
        // Startup already authenticated this Config. Keep all validation above,
        // and only reuse that completed result on the first UI auth attempt.
        const reuseReadyAuth =
          mayReuseReadyAuth &&
          config.isAuthReady?.() === true &&
          config.getContentGeneratorConfig()?.authType === authType;
        try {
          if (!reuseReadyAuth)
            await config.refreshAuth(
              authType,
              undefined,
              undefined,
              undefined,
              controller.signal,
            );
        } finally {
          // A settled authentication owns its ongoing admin polling in core.
          // Leaving the UI's waiting state must only cancel pending work.
          if (lifecycle.controller === controller)
            lifecycle.controller = undefined;
        }
        if (!isCurrent()) return;

        debugLogger.log(`Authenticated via "${authType}".`);
        setAuthError(null);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        if (!isCurrent()) return;
        if (e instanceof AuthRefreshSupersededError) return;
        if (
          e instanceof ChangeAuthRequestedError ||
          e instanceof ValidationCancelledError
        ) {
          setAuthError(null);
          setAuthState(AuthState.Updating);
          return;
        }
        const suspendedError = isAccountSuspendedError(e);
        if (suspendedError) {
          setAccountSuspensionInfo({
            message: suspendedError.message,
            appealUrl: suspendedError.appealUrl,
            appealLinkText: suspendedError.appealLinkText,
          });
        } else if (e instanceof ProjectIdRequiredError) {
          // OAuth succeeded but account setup requires project ID
          // Show the error message directly without "Failed to login" prefix
          onAuthError(getErrorMessage(e));
        } else {
          onAuthError(`Failed to sign in. Message: ${getErrorMessage(e)}`);
        }
      }
    })();
    return () => {
      active = false;
      if (lifecycle.authAttempt === attempt) lifecycle.authAttempt++;
      if (lifecycle.controller === controller) cancelPendingAuth();
    };
  }, [
    settings,
    config,
    authState,
    authRevision,
    setAuthState,
    setAuthError,
    onAuthError,
    reloadApiKey,
    onKeyLoadError,
    lifecycle,
    cancelPendingAuth,
  ]);

  return {
    authState,
    setAuthState,
    authError,
    onAuthError,
    apiKeyDefaultValue,
    reloadApiKey,
    handleApiKeySubmit,
    accountSuspensionInfo,
    setAccountSuspensionInfo,
  };
};
