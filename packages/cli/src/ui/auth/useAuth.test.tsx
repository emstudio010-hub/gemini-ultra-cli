/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useAuthCommand, validateAuthMethodWithSettings } from './useAuth.js';
import {
  AuthType,
  type Config,
  ProjectIdRequiredError,
  AuthRefreshSupersededError,
} from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock dependencies
const mockLoadApiKey = vi.fn();
const mockSaveApiKey = vi.fn();
const mockValidateAuthMethod = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadApiKey: () => mockLoadApiKey(),
    saveApiKey: (key: string) => mockSaveApiKey(key),
  };
});

vi.mock('../../config/auth.js', () => ({
  validateAuthMethod: (authType: AuthType) => mockValidateAuthMethod(authType),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_DEFAULT_AUTH_TYPE'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAuthMethodWithSettings', () => {
    it('should return error if auth type is enforced and does not match', async () => {
      const settings = {
        merged: {
          security: {
            auth: {
              enforcedType: AuthType.LOGIN_WITH_GOOGLE,
            },
          },
        },
      } as LoadedSettings;

      const error = await validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toContain('Authentication is enforced to be oauth');
    });

    it('should return null if useExternal is true', async () => {
      const settings = {
        merged: {
          security: {
            auth: {
              useExternal: true,
            },
          },
        },
      } as LoadedSettings;

      const error = await validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should return null if authType is USE_GEMINI', async () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      const error = await validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should call validateAuthMethod for other auth types', async () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      mockValidateAuthMethod.mockResolvedValue('Validation Error');
      const error = await validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBe('Validation Error');
      expect(mockValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.LOGIN_WITH_GOOGLE,
      );
    });
  });

  describe('useAuthCommand', () => {
    const mockConfig = {
      refreshAuth: vi.fn(),
    } as unknown as Config;

    const settingsByType = new Map<AuthType | undefined, LoadedSettings>();
    const createSettings = (selectedType?: AuthType) => {
      const existing = settingsByType.get(selectedType);
      if (existing) return existing;
      const settings = {
        merged: {
          security: {
            auth: {
              selectedType,
            },
          },
        },
      } as LoadedSettings;
      settingsByType.set(selectedType, settings);
      return settings;
    };

    let deferredRefreshAuth: {
      resolve: () => void;
      reject: (e: Error) => void;
    };

    beforeEach(() => {
      settingsByType.clear();
      vi.mocked(mockConfig.refreshAuth).mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            deferredRefreshAuth = { resolve, reject };
          }),
      );
    });

    describe('manual API key submission', () => {
      const openKeyInput = async () => {
        mockLoadApiKey.mockResolvedValue(null);
        const settings = createSettings(AuthType.USE_GEMINI);
        const screen = await renderHook(() =>
          useAuthCommand(settings, mockConfig),
        );
        expect(screen.result.current.authState).toBe(
          AuthState.AwaitingApiKeyInput,
        );
        mockLoadApiKey.mockClear();
        return screen;
      };

      it.each(['resolve', 'reject'] as const)(
        'does not start auth after cancelled key save %s',
        async (outcome) => {
          let release!: () => void;
          mockSaveApiKey.mockImplementationOnce(
            () =>
              new Promise<void>((resolve, reject) => {
                release = () =>
                  outcome === 'resolve'
                    ? resolve()
                    : reject(new Error('FAKE_PRIVATE_DETAIL'));
              }),
          );
          const screen = await openKeyInput();
          try {
            let pending!: Promise<void>;
            await act(async () => {
              pending =
                screen.result.current.handleApiKeySubmit('FAKE_OLD_KEY');
              await Promise.resolve();
            });
            expect(mockSaveApiKey).toHaveBeenCalledOnce();
            await act(async () => {
              screen.result.current.setAuthState(AuthState.Updating);
              release();
              await pending;
            });
            expect(mockLoadApiKey).not.toHaveBeenCalled();
            expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
            expect(screen.result.current.authState).toBe(AuthState.Updating);
            expect(screen.result.current.authError).toBeNull();
          } finally {
            screen.unmount();
          }
        },
      );

      it('does not start auth or display a key after a cancelled key reload', async () => {
        const screen = await openKeyInput();
        let release!: () => void;
        mockLoadApiKey.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = () => resolve('FAKE_LATE_KEY');
            }),
        );
        try {
          let pending!: Promise<void>;
          await act(async () => {
            pending = screen.result.current.handleApiKeySubmit('FAKE_KEY');
            await Promise.resolve();
            await Promise.resolve();
          });
          expect(mockLoadApiKey).toHaveBeenCalledOnce();
          await act(async () => {
            screen.result.current.setAuthState(AuthState.Updating);
            release();
            await pending;
          });
          expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
          expect(screen.result.current.apiKeyDefaultValue).not.toBe(
            'FAKE_LATE_KEY',
          );
          expect(screen.result.current.authError).toBeNull();
        } finally {
          screen.unmount();
        }
      });

      it('serializes saves and only authenticates the latest submitted key', async () => {
        const screen = await openKeyInput();
        let release!: () => void;
        const saved: string[] = [];
        mockSaveApiKey.mockImplementationOnce(
          (key: string) =>
            new Promise<void>((resolve) => {
              release = () => {
                saved.push(key);
                resolve();
              };
            }),
        );
        mockSaveApiKey.mockImplementationOnce(async (key: string) => {
          saved.push(key);
        });
        mockLoadApiKey.mockImplementation(async () => saved.at(-1) ?? null);
        vi.mocked(mockConfig.refreshAuth).mockResolvedValue(undefined);
        try {
          let old!: Promise<void>;
          let latest!: Promise<void>;
          await act(async () => {
            old = screen.result.current.handleApiKeySubmit('FAKE_OLD');
            await Promise.resolve();
            latest = screen.result.current.handleApiKeySubmit('FAKE_NEW');
            await Promise.resolve();
          });
          expect(mockSaveApiKey).toHaveBeenCalledTimes(1);
          await act(async () => {
            release();
            await Promise.all([old, latest]);
          });
          expect(saved).toEqual(['FAKE_OLD', 'FAKE_NEW']);
          expect(mockConfig.refreshAuth).toHaveBeenCalledExactlyOnceWith(
            AuthType.USE_GEMINI,
            undefined,
            undefined,
            undefined,
            expect.any(AbortSignal),
          );
          expect(screen.result.current.authState).toBe(AuthState.Authenticated);
          expect(screen.result.current.apiKeyDefaultValue).toBe('FAKE_NEW');
          expect(
            vi.mocked(mockConfig.refreshAuth).mock.calls[0]?.[4]?.aborted,
          ).toBe(false);
        } finally {
          screen.unmount();
        }
      });

      it('skips a queued save after cancellation and ignores its pending predecessor', async () => {
        const screen = await openKeyInput();
        let release!: () => void;
        mockSaveApiKey.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        );
        try {
          let old!: Promise<void>;
          let queued!: Promise<void>;
          await act(async () => {
            old = screen.result.current.handleApiKeySubmit('FAKE_OLD');
            await Promise.resolve();
            queued = screen.result.current.handleApiKeySubmit('FAKE_QUEUED');
            screen.result.current.setAuthState(AuthState.Updating);
            release();
            await Promise.all([old, queued]);
          });
          expect(mockSaveApiKey).toHaveBeenCalledExactlyOnceWith('FAKE_OLD');
          expect(mockLoadApiKey).not.toHaveBeenCalled();
          expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
        } finally {
          screen.unmount();
        }
      });

      it.each(['cancel', 'unmount'] as const)(
        'cancels manual core auth on %s without accepting its late completion',
        async (action) => {
          const screen = await openKeyInput();
          try {
            let pending!: Promise<void>;
            await act(async () => {
              pending = screen.result.current.handleApiKeySubmit('FAKE_KEY');
              await Promise.resolve();
              await Promise.resolve();
            });
            const signal = vi.mocked(mockConfig.refreshAuth).mock.calls[0]?.[4];
            expect(signal).toBeInstanceOf(AbortSignal);
            await act(async () => {
              if (action === 'unmount') screen.unmount();
              else screen.result.current.setAuthState(AuthState.Updating);
              expect(signal?.aborted).toBe(true);
              deferredRefreshAuth.resolve();
              await pending;
            });
            if (action === 'cancel')
              expect(screen.result.current.authState).toBe(AuthState.Updating);
          } finally {
            screen.unmount();
          }
        },
      );

      it.each(['save', 'auth'] as const)(
        'reports %s failure without revealing private details',
        async (stage) => {
          const screen = await openKeyInput();
          if (stage === 'save')
            mockSaveApiKey.mockRejectedValueOnce(
              new Error('FAKE_PRIVATE_DETAIL'),
            );
          else
            vi.mocked(mockConfig.refreshAuth).mockRejectedValueOnce(
              new Error('FAKE_PRIVATE_DETAIL'),
            );
          try {
            await act(async () =>
              screen.result.current.handleApiKeySubmit('FAKE_PRIVATE_KEY'),
            );
            expect(screen.result.current.authState).toBe(AuthState.Updating);
            expect(screen.result.current.authError).toContain(
              stage === 'save' ? 'save or read' : 'sign-in did not complete',
            );
            expect(screen.result.current.authError).not.toContain(
              'FAKE_PRIVATE',
            );
          } finally {
            screen.unmount();
          }
        },
      );
    });

    it.each(['error', 'selection', 'unmount', 'retry'] as const)(
      'cancels the pending core authentication on %s',
      async (action) => {
        const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
        const screen = await renderHook(() =>
          useAuthCommand(settings, mockConfig),
        );
        const old = deferredRefreshAuth;
        const signal = vi.mocked(mockConfig.refreshAuth).mock.calls[0]?.[4];
        let aborted = false;
        signal?.addEventListener('abort', () => {
          aborted = true;
        });
        try {
          await act(async () => {
            if (action === 'error')
              screen.result.current.onAuthError('USER_CANCELLED');
            else if (action === 'unmount') screen.unmount();
            else
              screen.result.current.setAuthState(
                action === 'retry'
                  ? AuthState.Unauthenticated
                  : AuthState.Updating,
              );
            // Cancellation must reach core before React effect cleanup.
            expect(aborted).toBe(true);
          });
          expect(signal?.reason).toBeInstanceOf(AuthRefreshSupersededError);
          if (action === 'retry') {
            const nextSignal = vi.mocked(mockConfig.refreshAuth).mock
              .calls[1]?.[4];
            expect(nextSignal).toBeInstanceOf(AbortSignal);
            expect(nextSignal).not.toBe(signal);
            expect(nextSignal?.aborted).toBe(false);
          }
          await act(async () => old.reject(new Error('OLD_AUTH_ERROR')));
          if (action !== 'unmount') {
            expect(screen.result.current.authError).toBe(
              action === 'error' ? 'USER_CANCELLED' : null,
            );
          }
        } finally {
          if (action !== 'unmount') screen.unmount();
        }
      },
    );

    it('does not abort a completed core authentication when the UI leaves waiting', async () => {
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      const signal = vi.mocked(mockConfig.refreshAuth).mock.calls[0]?.[4];
      try {
        await act(async () => deferredRefreshAuth.resolve());
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Updating),
        );
        expect(signal?.aborted).toBe(false);
      } finally {
        screen.unmount();
      }
      expect(signal?.aborted).toBe(false);
    });

    it.each(['resolve', 'reject'] as const)(
      'ignores a late auth %s after cancelling before effect cleanup',
      async (outcome) => {
        const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
        const screen = await renderHook(() =>
          useAuthCommand(settings, mockConfig),
        );
        try {
          await act(async () => {
            screen.result.current.onAuthError('USER_CANCELLED');
            if (outcome === 'resolve') deferredRefreshAuth.resolve();
            else deferredRefreshAuth.reject(new Error('OLD_AUTH_ERROR'));
          });
          expect(screen.result.current.authState).toBe(AuthState.Updating);
          expect(screen.result.current.authError).toBe('USER_CANCELLED');
          expect(screen.result.current.accountSuspensionInfo).toBeNull();
        } finally {
          screen.unmount();
        }
      },
    );

    it.each([null, 'OLD_VALIDATION_ERROR'])(
      'ignores cancelled validation completion %s before auth dispatch',
      async (validationError) => {
        let release!: (value: string | null) => void;
        mockValidateAuthMethod.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        );
        const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
        const screen = await renderHook(() =>
          useAuthCommand(settings, mockConfig),
        );
        try {
          await act(async () => {
            screen.result.current.onAuthError('USER_CANCELLED');
            release(validationError);
          });
          expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
          expect(screen.result.current.authState).toBe(AuthState.Updating);
          expect(screen.result.current.authError).toBe('USER_CANCELLED');
        } finally {
          screen.unmount();
        }
      },
    );

    it('ignores a saved key arriving after cancellation without displaying it or starting auth', async () => {
      let release!: (value: string) => void;
      mockLoadApiKey.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const settings = createSettings(AuthType.USE_GEMINI);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      try {
        await act(async () => {
          screen.result.current.onAuthError('USER_CANCELLED');
          release('FAKE_LATE_PRIVATE_KEY');
        });
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
        expect(screen.result.current.authState).toBe(AuthState.Updating);
        expect(screen.result.current.authError).toBe('USER_CANCELLED');
        expect(screen.result.current.apiKeyDefaultValue).toBeUndefined();
      } finally {
        screen.unmount();
      }
    });

    it('does not let an older failed attempt replace a newer authenticated result', async () => {
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      const old = deferredRefreshAuth;
      try {
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Updating),
        );
        vi.mocked(mockConfig.refreshAuth).mockResolvedValueOnce(undefined);
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Unauthenticated),
        );
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        await act(async () => old.reject(new Error('OLD_AUTH_ERROR')));
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        expect(screen.result.current.authError).toBeNull();
      } finally {
        screen.unmount();
      }
    });

    it('does not turn a superseded Config request into a new UI login error', async () => {
      vi.mocked(mockConfig.refreshAuth).mockRejectedValueOnce(
        new AuthRefreshSupersededError(),
      );
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      try {
        expect(screen.result.current.authError).toBeNull();
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Authenticated),
        );
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        expect(screen.result.current.authError).toBeNull();
      } finally {
        screen.unmount();
      }
    });

    it('starts a fresh explicit attempt even when the requested auth state is unchanged', async () => {
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      const old = deferredRefreshAuth;
      try {
        vi.mocked(mockConfig.refreshAuth).mockResolvedValueOnce(undefined);
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Unauthenticated),
        );
        expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(2);
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        await act(async () => old.reject(new Error('OLD_AUTH_ERROR')));
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
      } finally {
        screen.unmount();
      }
    });

    it('does not dispatch auth when validation completes after unmount', async () => {
      let release!: (value: string | null) => void;
      mockValidateAuthMethod.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      screen.unmount();
      await act(async () => release(null));
      expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
    });

    it('reports saved key loading failure without leaving auth pending or exposing private details', async () => {
      mockLoadApiKey.mockRejectedValueOnce(
        new Error('FAKE_PRIVATE_KEY_READ_DETAIL'),
      );
      const settings = createSettings(AuthType.USE_GEMINI);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      try {
        expect(screen.result.current.authState).toBe(AuthState.Updating);
        expect(screen.result.current.authError).toBeTruthy();
        expect(screen.result.current.authError).not.toContain(
          'FAKE_PRIVATE_KEY_READ_DETAIL',
        );
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
      } finally {
        screen.unmount();
      }
    });

    it('keeps the newest saved key read when an earlier reload finishes later', async () => {
      vi.mocked(mockConfig.refreshAuth).mockResolvedValueOnce(undefined);
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() =>
        useAuthCommand(settings, mockConfig),
      );
      let release!: (value: string) => void;
      mockLoadApiKey
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        )
        .mockResolvedValueOnce('FAKE_NEWEST_KEY');
      try {
        const first = screen.result.current.reloadApiKey();
        await act(async () => {
          await screen.result.current.reloadApiKey();
        });
        expect(screen.result.current.apiKeyDefaultValue).toBe(
          'FAKE_NEWEST_KEY',
        );
        await act(async () => {
          release('FAKE_OLDER_KEY');
          await first;
        });
        expect(screen.result.current.apiKeyDefaultValue).toBe(
          'FAKE_NEWEST_KEY',
        );
      } finally {
        screen.unmount();
      }
    });

    it('reuses ready startup auth only once after validation and refreshes an explicit later attempt', async () => {
      const config = {
        isAuthReady: () => true,
        getContentGeneratorConfig: () => ({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
        refreshAuth: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() => useAuthCommand(settings, config));
      try {
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        expect(mockValidateAuthMethod).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(config.refreshAuth).not.toHaveBeenCalled();
        await act(async () =>
          screen.result.current.setAuthState(AuthState.Unauthenticated),
        );
        expect(config.refreshAuth).toHaveBeenCalledOnce();
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
      } finally {
        screen.unmount();
      }
    });

    it('does not reuse startup auth invalidated while validation was pending', async () => {
      let ready = true;
      let release!: (value: string | null) => void;
      mockValidateAuthMethod.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const config = {
        isAuthReady: () => ready,
        getContentGeneratorConfig: () => ({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
        refreshAuth: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
      const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
      const screen = await renderHook(() => useAuthCommand(settings, config));
      try {
        expect(screen.result.current.authState).toBe(AuthState.Unauthenticated);
        expect(config.refreshAuth).not.toHaveBeenCalled();
        await act(async () => {
          ready = false;
          release(null);
        });
        expect(config.refreshAuth).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
          undefined,
          undefined,
          undefined,
          expect.any(AbortSignal),
        );
        expect(screen.result.current.authState).toBe(AuthState.Authenticated);
      } finally {
        screen.unmount();
      }
    });

    it.each(['enforced', 'validation', 'environment'] as const)(
      'still rejects %s errors when startup auth is already ready',
      async (kind) => {
        const config = {
          isAuthReady: () => true,
          getContentGeneratorConfig: () => ({
            authType: AuthType.LOGIN_WITH_GOOGLE,
          }),
          refreshAuth: vi.fn(),
        } as unknown as Config;
        const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
        if (kind === 'enforced')
          settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
        if (kind === 'validation')
          mockValidateAuthMethod.mockResolvedValue('Validation Failed');
        if (kind === 'environment')
          process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'INVALID_TYPE';
        const screen = await renderHook(() => useAuthCommand(settings, config));
        try {
          expect(screen.result.current.authState).toBe(AuthState.Updating);
          expect(screen.result.current.authError).toContain(
            kind === 'enforced'
              ? 'Authentication is enforced'
              : kind === 'validation'
                ? 'Validation Failed'
                : 'Invalid value for GEMINI_DEFAULT_AUTH_TYPE',
          );
          expect(config.refreshAuth).not.toHaveBeenCalled();
        } finally {
          screen.unmount();
        }
      },
    );

    it.each(['not-ready', 'different-method'] as const)(
      'refreshes startup auth when it is %s',
      async (kind) => {
        const config = {
          isAuthReady: () => kind !== 'not-ready',
          getContentGeneratorConfig: () => ({
            authType:
              kind === 'different-method'
                ? AuthType.USE_GEMINI
                : AuthType.LOGIN_WITH_GOOGLE,
          }),
          refreshAuth: vi.fn().mockResolvedValue(undefined),
        } as unknown as Config;
        const settings = createSettings(AuthType.LOGIN_WITH_GOOGLE);
        const screen = await renderHook(() => useAuthCommand(settings, config));
        try {
          expect(config.refreshAuth).toHaveBeenCalledWith(
            AuthType.LOGIN_WITH_GOOGLE,
            undefined,
            undefined,
            undefined,
            expect.any(AbortSignal),
          );
          expect(screen.result.current.authState).toBe(AuthState.Authenticated);
        } finally {
          screen.unmount();
        }
      },
    );

    it('should initialize with Unauthenticated state', async () => {
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );
      // Because we defer refreshAuth, the initial state is safely caught here
      expect(result.current.authState).toBe(AuthState.Unauthenticated);

      await act(async () => {
        deferredRefreshAuth.resolve();
      });

      expect(result.current.authState).toBe(AuthState.Authenticated);
    });

    it('should set error if no auth type is selected and no env key', async () => {
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      // This happens synchronously, no deferred promise
      expect(result.current.authError).toBe(
        'No authentication method selected.',
      );
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should set error if no auth type is selected but env key exists', async () => {
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      expect(result.current.authError).toContain(
        'Existing API key detected (GEMINI_API_KEY)',
      );
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should transition to AwaitingApiKeyInput if USE_GEMINI and no key found', async () => {
      let deferredLoadKey: { resolve: (k: string | null) => void };
      mockLoadApiKey.mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredLoadKey = { resolve };
          }),
      );

      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await act(async () => {
        deferredLoadKey.resolve(null);
      });

      expect(result.current.authState).toBe(AuthState.AwaitingApiKeyInput);
    });

    it('should authenticate if USE_GEMINI and key is found', async () => {
      let deferredLoadKey: { resolve: (k: string | null) => void };
      mockLoadApiKey.mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredLoadKey = { resolve };
          }),
      );

      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await act(async () => {
        deferredLoadKey.resolve('stored-key');
      });

      await act(async () => {
        deferredRefreshAuth.resolve();
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(result.current.authState).toBe(AuthState.Authenticated);
      expect(result.current.apiKeyDefaultValue).toBe('stored-key');
    });

    it('should authenticate if USE_GEMINI and env key is found', async () => {
      process.env['GEMINI_API_KEY'] = 'env-key';

      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.resolve();
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(result.current.authState).toBe(AuthState.Authenticated);
      expect(result.current.apiKeyDefaultValue).toBe('env-key');
    });

    it('should prioritize env key over stored key when both are present', async () => {
      process.env['GEMINI_API_KEY'] = 'env-key';

      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.resolve();
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(result.current.authState).toBe(AuthState.Authenticated);
      expect(result.current.apiKeyDefaultValue).toBe('env-key');
    });

    it('should set error if validation fails', async () => {
      mockValidateAuthMethod.mockResolvedValue('Validation Failed');
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      expect(result.current.authError).toBe('Validation Failed');
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should set error if GEMINI_DEFAULT_AUTH_TYPE is invalid', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'INVALID_TYPE';
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      expect(result.current.authError).toContain(
        'Invalid value for GEMINI_DEFAULT_AUTH_TYPE',
      );
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should authenticate successfully for valid auth type', async () => {
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.resolve();
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
        AuthType.LOGIN_WITH_GOOGLE,
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(result.current.authState).toBe(AuthState.Authenticated);
      expect(result.current.authError).toBeNull();
    });

    it('should handle refreshAuth failure', async () => {
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.reject(new Error('Auth Failed'));
      });

      expect(result.current.authError).toContain('Failed to sign in');
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should handle ProjectIdRequiredError without "Failed to login" prefix', async () => {
      const projectIdError = new ProjectIdRequiredError();
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.reject(projectIdError);
      });

      expect(result.current.authError).toBe(
        'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://geminicli.com/docs/get-started/authentication/#set-gcp',
      );
      expect(result.current.authError).not.toContain('Failed to login');
      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should transition to Updating without setting authError on ChangeAuthRequestedError or ValidationCancelledError', async () => {
      const { ChangeAuthRequestedError } = await import(
        '@google/gemini-cli-core'
      );
      const { result } = await renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await act(async () => {
        deferredRefreshAuth.reject(new ChangeAuthRequestedError());
      });

      expect(result.current.authError).toBeNull();
      expect(result.current.authState).toBe(AuthState.Updating);
    });
  });
});
