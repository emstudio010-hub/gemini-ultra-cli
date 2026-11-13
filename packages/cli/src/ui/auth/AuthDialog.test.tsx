/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { AuthDialog } from './AuthDialog.js';
import {
  AuthType,
  type Config,
  debugLogger,
  clearCachedCredentialFile,
} from '@google/gemini-cli-core';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';
import { AuthState } from '../types.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { Text } from 'ink';
import * as processUtils from '../../utils/processUtils.js';

// Mocks
const mockProviderManager = vi.hoisted(() => ({
  getActiveProvider: vi.fn(),
  setActiveSelection: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    clearCachedCredentialFile: vi.fn(),
    ProviderManager: { getInstance: () => mockProviderManager },
  };
});

vi.mock('./useAuth.js', () => ({
  validateAuthMethodWithSettings: vi.fn(),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(({ items, initialIndex }) => (
    <>
      {items.map((item: { value: string; label: string }, index: number) => (
        <Text key={item.value}>
          {index === initialIndex ? '(selected)' : '(not selected)'}{' '}
          {item.label}
        </Text>
      ))}
    </>
  )),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedRadioButtonSelect = RadioButtonSelect as Mock;
const mockedValidateAuthMethod = validateAuthMethodWithSettings as Mock;
const locale = vi.hoisted(() => ({ value: 'en' as 'en' | 'zh' }));
vi.mock('../hooks/useLocale.js', () => ({ useLocale: () => locale.value }));

describe('AuthDialog', () => {
  let props: {
    config: Config;
    settings: LoadedSettings;
    setAuthState: (state: AuthState) => void;
    authError: string | null;
    onAuthError: (error: string | null) => void;
    setAuthContext: (context: { requiresRestart?: boolean }) => void;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    locale.value = 'en';
    mockProviderManager.getActiveProvider.mockReturnValue({ id: 'fixture' });
    vi.stubEnv('CLOUD_SHELL', undefined as unknown as string);
    vi.stubEnv('GEMINI_CLI_USE_COMPUTE_ADC', undefined as unknown as string);
    vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', undefined as unknown as string);
    vi.stubEnv('GEMINI_API_KEY', undefined as unknown as string);

    props = {
      config: {
        isBrowserLaunchSuppressed: vi.fn().mockReturnValue(false),
      } as unknown as Config,
      settings: {
        merged: {
          security: {
            auth: {},
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings,
      setAuthState: vi.fn(),
      authError: null,
      onAuthError: vi.fn(),
      setAuthContext: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('switches selection instructions and Cloud Shell labels with the interface language', async () => {
    vi.stubEnv('CLOUD_SHELL', 'true');
    const screen = await renderWithProviders(<AuthDialog {...props} />);
    try {
      locale.value = 'zh';
      await act(async () => screen.rerender(<AuthDialog {...props} />));
      await screen.waitUntilReady();
      expect(
        mockedRadioButtonSelect.mock.calls.at(-1)?.[0].items,
      ).toContainEqual({
        label: '使用 Cloud Shell 用户凭据',
        value: AuthType.COMPUTE_ADC,
        key: AuthType.COMPUTE_ADC,
      });
      expect(screen.lastFrame()).toContain('Gemini CLI 服务条款和隐私声明');
      mockedUseKeypress.mock.calls.at(-1)?.[0]({ name: 'escape' });
      expect(props.onAuthError).toHaveBeenCalledWith(
        '请先选择认证方式。连续按两次 Ctrl+C 退出。',
      );
      locale.value = 'en';
      await act(async () => screen.rerender(<AuthDialog {...props} />));
      await screen.waitUntilReady();
      expect(
        mockedRadioButtonSelect.mock.calls.at(-1)?.[0].items,
      ).toContainEqual({
        label: 'Use Cloud Shell user credentials',
        value: AuthType.COMPUTE_ADC,
        key: AuthType.COMPUTE_ADC,
      });
      expect(screen.lastFrame()).not.toContain('服务条款和隐私声明');
      expect(props.settings.setValue).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
    }
  });

  describe('Environment Variable Effects on Auth Options', () => {
    const cloudShellLabel = 'Use Cloud Shell user credentials';
    const metadataServerLabel =
      'Use metadata server application default credentials';
    const computeAdcItem = (label: string) => ({
      label,
      value: AuthType.COMPUTE_ADC,
      key: AuthType.COMPUTE_ADC,
    });

    it.each([
      {
        env: { CLOUD_SHELL: 'true' },
        shouldContain: [computeAdcItem(cloudShellLabel)],
        shouldNotContain: [computeAdcItem(metadataServerLabel)],
        desc: 'in Cloud Shell',
      },
      {
        env: { GEMINI_CLI_USE_COMPUTE_ADC: 'true' },
        shouldContain: [computeAdcItem(metadataServerLabel)],
        shouldNotContain: [computeAdcItem(cloudShellLabel)],
        desc: 'with GEMINI_CLI_USE_COMPUTE_ADC',
      },
      {
        env: {},
        shouldContain: [],
        shouldNotContain: [
          computeAdcItem(cloudShellLabel),
          computeAdcItem(metadataServerLabel),
        ],
        desc: 'by default',
      },
    ])(
      'correctly shows/hides COMPUTE_ADC options $desc',
      async ({ env, shouldContain, shouldNotContain }) => {
        for (const [key, value] of Object.entries(env)) {
          vi.stubEnv(key, value as string);
        }
        const { unmount } = await renderWithProviders(
          <AuthDialog {...props} />,
        );
        const items = mockedRadioButtonSelect.mock.calls[0][0].items;
        for (const item of shouldContain) {
          expect(items).toContainEqual(item);
        }
        for (const item of shouldNotContain) {
          expect(items).not.toContainEqual(item);
        }
        unmount();
      },
    );
  });

  it('filters auth types when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe(AuthType.USE_GEMINI);
    unmount();
  });

  it('sets initial index to 0 when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
    const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
    expect(initialIndex).toBe(0);
    unmount();
  });

  describe('Initial Auth Type Selection', () => {
    it.each([
      {
        setup: () => {
          props.settings.merged.security.auth.selectedType =
            AuthType.USE_VERTEX_AI;
        },
        expected: AuthType.USE_VERTEX_AI,
        desc: 'from settings',
      },
      {
        setup: () => {
          vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', AuthType.USE_GEMINI);
        },
        expected: AuthType.USE_GEMINI,
        desc: 'from GEMINI_DEFAULT_AUTH_TYPE env var',
      },
      {
        setup: () => {
          vi.stubEnv('GEMINI_API_KEY', 'test-key');
        },
        expected: AuthType.USE_GEMINI,
        desc: 'from GEMINI_API_KEY env var',
      },
      {
        setup: () => {},
        expected: AuthType.LOGIN_WITH_GOOGLE,
        desc: 'defaults to Sign in with Google',
      },
    ])('selects initial auth type $desc', async ({ setup, expected }) => {
      setup();
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { items, initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(items[initialIndex].value).toBe(expected);
      unmount();
    });
  });

  describe('handleAuthSelect', () => {
    it.each([null, 'OLD_VALIDATION_ERROR'])(
      'ignores validation result %s after highlighting another auth method',
      async (error) => {
        let release!: (error: string | null) => void;
        mockedValidateAuthMethod.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        );
        const { unmount } = await renderWithProviders(
          <AuthDialog {...props} />,
        );
        const callbacks = mockedRadioButtonSelect.mock.calls[0][0];
        try {
          const pending = callbacks.onSelect(AuthType.LOGIN_WITH_GOOGLE);
          callbacks.onHighlight(AuthType.USE_GEMINI);
          vi.mocked(props.onAuthError).mockClear();
          await act(async () => {
            release(error);
            await pending;
          });
          expect(props.onAuthError).not.toHaveBeenCalled();
          expect(clearCachedCredentialFile).not.toHaveBeenCalled();
          expect(props.settings.setValue).not.toHaveBeenCalled();
          expect(props.setAuthState).not.toHaveBeenCalled();
        } finally {
          unmount();
        }
      },
    );

    it.each(['resolve', 'reject'] as const)(
      'ignores old credential cleanup %s after selecting a newer auth method',
      async (outcome) => {
        let release!: () => void;
        mockedValidateAuthMethod.mockResolvedValue(null);
        vi.mocked(clearCachedCredentialFile).mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              release = () =>
                outcome === 'resolve'
                  ? resolve()
                  : reject(new Error('OLD_CREDENTIAL_ERROR'));
            }),
        );
        const { unmount } = await renderWithProviders(
          <AuthDialog {...props} />,
        );
        const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
        try {
          const old = onSelect(AuthType.LOGIN_WITH_GOOGLE);
          await act(async () => {
            await Promise.resolve();
          });
          expect(clearCachedCredentialFile).toHaveBeenCalledOnce();
          await act(async () => onSelect(AuthType.USE_GEMINI));
          vi.mocked(props.onAuthError).mockClear();
          vi.mocked(props.setAuthContext).mockClear();
          await act(async () => {
            release();
            await old;
          });
          expect(props.settings.setValue).toHaveBeenCalledExactlyOnceWith(
            SettingScope.User,
            'security.auth.selectedType',
            AuthType.USE_GEMINI,
          );
          expect(props.setAuthState).toHaveBeenCalledExactlyOnceWith(
            AuthState.AwaitingApiKeyInput,
          );
          expect(props.onAuthError).not.toHaveBeenCalled();
          expect(props.setAuthContext).not.toHaveBeenCalled();
          expect(
            mockProviderManager.setActiveSelection,
          ).toHaveBeenCalledExactlyOnceWith(undefined);
        } finally {
          unmount();
        }
      },
    );

    it('ignores validation finishing after the selection dialog unmounts', async () => {
      let release!: () => void;
      mockedValidateAuthMethod.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(null);
          }),
      );
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const pending = mockedRadioButtonSelect.mock.calls[0][0].onSelect(
        AuthType.LOGIN_WITH_GOOGLE,
      );
      unmount();
      await act(async () => {
        release();
        await pending;
      });
      expect(clearCachedCredentialFile).not.toHaveBeenCalled();
      expect(props.settings.setValue).not.toHaveBeenCalled();
      expect(props.onAuthError).not.toHaveBeenCalled();
    });

    it('invalidates pending selection validation when Escape keeps the previous auth method', async () => {
      props.settings.merged.security.auth.selectedType = AuthType.GATEWAY;
      let release!: () => void;
      mockedValidateAuthMethod.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(null);
          }),
      );
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      try {
        const pending = mockedRadioButtonSelect.mock.calls[0][0].onSelect(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        mockedUseKeypress.mock.calls[0][0]({ name: 'escape' });
        await act(async () => {
          release();
          await pending;
        });
        expect(props.setAuthState).toHaveBeenCalledExactlyOnceWith(
          AuthState.Unauthenticated,
        );
        expect(props.settings.setValue).not.toHaveBeenCalled();
        expect(clearCachedCredentialFile).not.toHaveBeenCalled();
      } finally {
        unmount();
      }
    });

    it('cancels a scheduled Google relaunch when the selection dialog unmounts', async () => {
      vi.useFakeTimers();
      const relaunchSpy = vi
        .spyOn(processUtils, 'relaunchApp')
        .mockResolvedValue(undefined);
      vi.mocked(props.config.isBrowserLaunchSuppressed).mockReturnValue(true);
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      try {
        await act(async () =>
          mockedRadioButtonSelect.mock.calls[0][0].onSelect(
            AuthType.LOGIN_WITH_GOOGLE,
          ),
        );
        unmount();
        await act(async () => vi.advanceTimersByTimeAsync(150));
        expect(relaunchSpy).not.toHaveBeenCalled();
      } finally {
        unmount();
        relaunchSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('calls onAuthError if validation fails', async () => {
      mockedValidateAuthMethod.mockResolvedValue('Invalid method');
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(mockedValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        props.settings,
      );
      expect(props.onAuthError).toHaveBeenCalledWith('Invalid method');
      expect(props.settings.setValue).not.toHaveBeenCalled();
      unmount();
    });

    it('sets auth context with requiresRestart: true for LOGIN_WITH_GOOGLE', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);

      expect(props.setAuthContext).toHaveBeenCalledWith({
        requiresRestart: true,
      });
      unmount();
    });

    it('sets auth context with requiresRestart: true for USE_VERTEX_AI in Cloud Shell', async () => {
      vi.stubEnv('CLOUD_SHELL', 'true');
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_VERTEX_AI);

      expect(props.setAuthContext).toHaveBeenCalledWith({
        requiresRestart: true,
      });
      unmount();
    });

    it('sets auth context with empty object for USE_VERTEX_AI outside Cloud Shell', async () => {
      vi.stubEnv('CLOUD_SHELL', '');
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_VERTEX_AI);

      expect(props.setAuthContext).toHaveBeenCalledWith({});
      unmount();
    });

    it('sets auth context with empty object for other auth types', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthContext).toHaveBeenCalledWith({});
      unmount();
    });

    it('always shows API key dialog even when env var is present', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.stubEnv('GEMINI_API_KEY', 'test-key-from-env');
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('always shows API key dialog even when env var is empty string', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.stubEnv('GEMINI_API_KEY', ''); // Empty string
      // props.settings.merged.security.auth.selectedType is undefined here

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('shows API key dialog on initial setup if no env var is present', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      // process.env['GEMINI_API_KEY'] is not set
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('always shows API key dialog on re-auth even if env var is present', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.stubEnv('GEMINI_API_KEY', 'test-key-from-env');
      // Simulate switching from a different auth method (e.g., Google Login → API key)
      props.settings.merged.security.auth.selectedType =
        AuthType.LOGIN_WITH_GOOGLE;

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('clears cached credentials when re-selecting LOGIN_WITH_GOOGLE to prevent staying stuck in cached account', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      // Simulate that user is currently signed in with Google (e.g. cached free-tier account from previous test run)
      props.settings.merged.security.auth.selectedType =
        AuthType.LOGIN_WITH_GOOGLE;

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      // User selects "Sign in with Google" again expecting to authenticate/switch accounts
      await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);

      const { clearCachedCredentialFile } = await import(
        '@google/gemini-cli-core'
      );
      expect(clearCachedCredentialFile).toHaveBeenCalled();
      unmount();
    });

    it('clears cached credentials when selecting LOGIN_WITH_GOOGLE even if selectedType is undefined', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      props.settings.merged.security.auth.selectedType = undefined;

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);

      const { clearCachedCredentialFile } = await import(
        '@google/gemini-cli-core'
      );
      expect(clearCachedCredentialFile).toHaveBeenCalled();
      unmount();
    });

    it('does not clear cached credentials when switching between non-Google auth methods', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      props.settings.merged.security.auth.selectedType = AuthType.USE_GEMINI;

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      await handleAuthSelect(AuthType.USE_VERTEX_AI);

      const { clearCachedCredentialFile } = await import(
        '@google/gemini-cli-core'
      );
      expect(clearCachedCredentialFile).not.toHaveBeenCalled();
      unmount();
    });

    it('handles errors when clearCachedCredentialFile fails gracefully and logs via debugLogger', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      props.settings.merged.security.auth.selectedType =
        AuthType.LOGIN_WITH_GOOGLE;

      const { clearCachedCredentialFile } = await import(
        '@google/gemini-cli-core'
      );
      const testError = new Error('Disk I/O failure');
      vi.mocked(clearCachedCredentialFile).mockRejectedValueOnce(testError);
      const errorSpy = vi
        .spyOn(debugLogger, 'error')
        .mockImplementation(() => {});

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      await expect(
        handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE),
      ).resolves.not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to clear cached credentials:',
        testError,
      );
      expect(props.onAuthError).toHaveBeenCalledWith(
        'Failed to clear cached credentials: Disk I/O failure',
      );
      expect(props.settings.setValue).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      unmount();
    });

    it('allows switching to non-Google auth methods even if clearCachedCredentialFile fails to prevent lockouts', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      props.settings.merged.security.auth.selectedType =
        AuthType.LOGIN_WITH_GOOGLE;

      const { clearCachedCredentialFile } = await import(
        '@google/gemini-cli-core'
      );
      const testError = new Error('Disk I/O failure');
      vi.mocked(clearCachedCredentialFile).mockRejectedValueOnce(testError);
      const errorSpy = vi
        .spyOn(debugLogger, 'error')
        .mockImplementation(() => {});

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      await expect(
        handleAuthSelect(AuthType.USE_GEMINI),
      ).resolves.not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to clear cached credentials:',
        testError,
      );
      expect(props.onAuthError).toHaveBeenCalledWith(
        'Failed to clear cached credentials: Disk I/O failure',
      );
      expect(props.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.selectedType',
        AuthType.USE_GEMINI,
      );
      errorSpy.mockRestore();
      unmount();
    });

    it('requests supervisor relaunch for Sign in with Google when browser is suppressed', async () => {
      vi.useFakeTimers();
      const relaunchSpy = vi
        .spyOn(processUtils, 'relaunchApp')
        .mockResolvedValue(undefined);
      vi.mocked(props.config.isBrowserLaunchSuppressed).mockReturnValue(true);
      mockedValidateAuthMethod.mockResolvedValue(null);

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      try {
        await act(async () => {
          await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);
          await vi.advanceTimersByTimeAsync(150);
        });
        expect(relaunchSpy).toHaveBeenCalledExactlyOnceWith({
          overrideAuthType: AuthType.LOGIN_WITH_GOOGLE,
        });
      } finally {
        unmount();
        relaunchSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('catches errors thrown during onSelect and forwards them to onAuthError', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.mocked(props.settings.setValue).mockImplementationOnce(() => {
        throw new Error('Failed to update settings');
      });

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.onAuthError).toHaveBeenCalledWith(null);
      expect(props.onAuthError).toHaveBeenCalledWith(
        'Failed to update settings',
      );
      unmount();
    });
  });

  it('displays authError when provided', async () => {
    props.authError = 'Something went wrong';
    const { lastFrame, unmount } = await renderWithProviders(
      <AuthDialog {...props} />,
    );
    expect(lastFrame()).toContain('Something went wrong');
    unmount();
  });

  describe('useKeypress', () => {
    it.each([
      {
        desc: 'does nothing on escape if authError is present',
        setup: () => {
          props.authError = 'Some error';
        },
        expectations: (p: typeof props) => {
          expect(p.onAuthError).not.toHaveBeenCalled();
          expect(p.setAuthState).not.toHaveBeenCalled();
        },
      },
      {
        desc: 'calls onAuthError on escape if no auth method is set',
        setup: () => {
          props.settings.merged.security.auth.selectedType = undefined;
        },
        expectations: (p: typeof props) => {
          expect(p.onAuthError).toHaveBeenCalledWith(
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          );
        },
      },
      {
        desc: 'calls setAuthState(Unauthenticated) on escape if auth method is set',
        setup: () => {
          props.settings.merged.security.auth.selectedType =
            AuthType.USE_GEMINI;
        },
        expectations: (p: typeof props) => {
          expect(p.setAuthState).toHaveBeenCalledWith(
            AuthState.Unauthenticated,
          );
          expect(p.settings.setValue).not.toHaveBeenCalled();
        },
      },
    ])('$desc', async ({ setup, expectations }) => {
      setup();
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expectations(props);
      unmount();
    });
  });

  describe('Snapshots', () => {
    it('renders correctly with default props', async () => {
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with auth error', async () => {
      props.authError = 'Something went wrong';
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with enforced auth type', async () => {
      props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
