/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act } from 'react';
import { ModelDialog } from './ModelDialog.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { createMockSettings } from '../../test-utils/settings.js';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_FLASH_LITE_MODEL,
  AuthType,
  ModelConfigService,
  DEFAULT_MODEL_CONFIGS,
  ProviderManager,
  I18nManager,
} from '@google/gemini-cli-core';
import type { Config, ModelSlashCommandEvent } from '@google/gemini-cli-core';

// Mock dependencies
const mockGetDisplayString = vi.fn();
const mockLogModelSlashCommand = vi.fn();
const mockModelSlashCommandEvent = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getAutoModelDescription: (
      hasAccessToPreview: boolean,
      useGemini3_1?: boolean,
    ) =>
      `Auto Model Description (preview: ${hasAccessToPreview}, 3.1: ${useGemini3_1})`,
    getDisplayString: (val: string) => mockGetDisplayString(val),
    logModelSlashCommand: (config: Config, event: ModelSlashCommandEvent) =>
      mockLogModelSlashCommand(config, event),
    ModelSlashCommandEvent: class {
      constructor(model: string) {
        mockModelSlashCommandEvent(model);
      }
    },
    PREVIEW_GEMINI_FLASH_LITE_MODEL: 'none',
  };
});

describe('<ModelDialog />', () => {
  let localeRoot: string;
  const mockSetModel = vi.fn();
  const mockGetModel = vi.fn();
  const mockOnClose = vi.fn();
  const mockGetHasAccessToPreviewModel = vi.fn();
  const mockGetGemini31LaunchedSync = vi.fn();
  const mockGetGemini31FlashLiteLaunchedSync = vi.fn();
  const mockGetProModelNoAccess = vi.fn();
  const mockGetProModelNoAccessSync = vi.fn();
  const mockRefreshUserQuota = vi.fn<Config['refreshUserQuota']>();

  interface MockConfig extends Partial<Config> {
    setModel: (model: string, isTemporary?: boolean) => void;
    getModel: () => string;
    getHasAccessToPreviewModel: () => boolean;
    getIdeMode: () => boolean;
    getGemini31LaunchedSync: () => boolean;
    getProModelNoAccess: () => Promise<boolean>;
    getProModelNoAccessSync: () => boolean;
    getExperimentalGemma: () => boolean;
    getLastRetrievedQuota: () =>
      | {
          buckets: Array<{
            modelId?: string;
            remainingFraction?: number;
            resetTime?: string;
          }>;
        }
      | undefined;
  }

  const mockConfig: MockConfig = {
    setModel: mockSetModel,
    getModel: mockGetModel,
    getHasAccessToPreviewModel: mockGetHasAccessToPreviewModel,
    getIdeMode: () => false,
    getGemini31LaunchedSync: mockGetGemini31LaunchedSync,
    getProModelNoAccess: mockGetProModelNoAccess,
    getProModelNoAccessSync: mockGetProModelNoAccessSync,
    getExperimentalGemma: () => false,
    getLastRetrievedQuota: () => ({ buckets: [] }),
    refreshUserQuota: mockRefreshUserQuota,
    getSessionId: () => 'test-session-id',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    localeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-model-locale-'));
    vi.stubEnv(
      'GEMINI_ULTRA_LOCALE_FILE',
      path.join(localeRoot, 'locale.json'),
    );
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(localeRoot, 'providers.json'),
    );
    ProviderManager.resetInstance();
    I18nManager.getInstance().setLocale('en');
    mockGetModel.mockReturnValue(GEMINI_MODEL_ALIAS_AUTO);
    mockGetHasAccessToPreviewModel.mockReturnValue(false);
    mockGetGemini31LaunchedSync.mockReturnValue(false);
    mockGetProModelNoAccess.mockResolvedValue(false);
    mockGetProModelNoAccessSync.mockReturnValue(false);
    mockRefreshUserQuota.mockResolvedValue({ buckets: [] });

    // Default implementation for getDisplayString
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === 'auto') return 'Auto';
      return val;
    });
  });

  afterEach(() => {
    ProviderManager.resetInstance();
    vi.unstubAllEnvs();
    fs.rmSync(localeRoot, { recursive: true, force: true });
  });

  const renderComponent = async (
    configValue = mockConfig as Config,
    authType = AuthType.LOGIN_WITH_GOOGLE,
  ) => {
    const settings = createMockSettings({
      security: {
        auth: {
          selectedType: authType,
        },
      },
    });

    const result = await renderWithProviders(
      <ModelDialog onClose={mockOnClose} />,
      {
        config: configValue,
        settings,
      },
    );
    return result;
  };

  it('opens with cached quota while refreshing and renders new quota without closing the selector', async () => {
    let buckets = [{ modelId: 'fixture-quota', remainingFraction: 0.5 }];
    let release!: (value: { buckets: typeof buckets }) => void;
    let signal: AbortSignal | undefined;
    mockRefreshUserQuota.mockImplementationOnce((value) => {
      signal = value;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const config = {
      ...mockConfig,
      getLastRetrievedQuota: () => ({ buckets }),
    } as Config;
    const screen = await renderComponent(config);
    try {
      expect(screen.lastFrame()).toContain('Select Model');
      expect(screen.lastFrame()).toContain('50%');
      expect(screen.lastFrame()).toContain('Refreshing quota');
      expect(signal?.aborted).toBe(false);
      await act(async () => {
        buckets = [{ modelId: 'fixture-quota', remainingFraction: 0.15 }];
        release({ buckets });
      });
      await waitFor(() => expect(screen.lastFrame()).toContain('85%'));
      expect(screen.lastFrame()).not.toContain('Refreshing quota');
      expect(mockRefreshUserQuota).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
    }
    expect(signal?.aborted).toBe(true);
  });

  it('cancels quota refresh on close and ignores its late completion', async () => {
    let release!: (value: { buckets: [] }) => void;
    let signal: AbortSignal | undefined;
    mockRefreshUserQuota.mockImplementationOnce((value) => {
      signal = value;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const screen = await renderComponent();
    expect(screen.lastFrame()).toContain('Select Model');
    screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => release({ buckets: [] }));
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockRefreshUserQuota).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'updates model dialog language without losing Remember or route (dynamic=%s)',
    async (dynamic) => {
      const manager = ProviderManager.getInstance();
      manager.upsertProvider({
        name: 'route',
        baseUrl: 'https://route.invalid/v1',
        apiKey: '',
        models: ['shared'],
        setActive: true,
      });
      const providersBefore = fs.readFileSync(
        path.join(localeRoot, 'providers.json'),
      );
      mockGetModel.mockReturnValue('route:shared');
      const config = dynamic
        ? ({
            ...mockConfig,
            getExperimentalDynamicModelConfiguration: () => true,
            getModelConfigService: () =>
              new ModelConfigService(DEFAULT_MODEL_CONFIGS),
          } as unknown as Config)
        : (mockConfig as Config);
      const rendered = await renderComponent(config);
      try {
        expect(rendered.lastFrame()).toContain(
          'External provider (openai-chat)',
        );
        expect(rendered.lastFrame()).not.toContain('外接供应商');
        await act(async () => {
          rendered.stdin.write('\t');
          await rendered.waitUntilReady();
        });
        await act(async () => {
          I18nManager.getInstance().setLocale('zh');
        });
        await waitFor(() => expect(rendered.lastFrame()).toContain('选择模型'));
        expect(rendered.lastFrame()).toContain('记住模型供后续会话使用：开启');
        expect(rendered.lastFrame()).toContain('外接供应商 (openai-chat)');
        expect(rendered.lastFrame()).toContain('手动选择');
        expect(rendered.lastFrame()).toContain('按 Tab 切换');
        expect(rendered.lastFrame()).not.toContain('Remember model');
        expect(rendered.lastFrame()).not.toContain('Manually select a model');
        await act(async () => {
          I18nManager.getInstance().setLocale('en');
        });
        await waitFor(() =>
          expect(rendered.lastFrame()).toContain(
            'Remember model for future sessions: true',
          ),
        );
        expect(mockSetModel).not.toHaveBeenCalled();
        expect(
          fs
            .readFileSync(path.join(localeRoot, 'providers.json'))
            .equals(providersBefore),
        ).toBe(true);
        await act(async () => {
          rendered.stdin.write('\r');
          await rendered.waitUntilReady();
        });
        await waitFor(() =>
          expect(mockSetModel).toHaveBeenCalledWith('route:shared', false),
        );
      } finally {
        rendered.unmount();
      }
    },
  );

  it.each(['zh', 'en'] as const)(
    'keeps the model dialog open on save failure and permits retry (%s)',
    async (locale) => {
      I18nManager.getInstance().setLocale(locale);
      mockSetModel.mockImplementationOnce(() => {
        throw new Error('PRIVATE_WRITE_DETAIL');
      });
      const rendered = await renderComponent();
      try {
        await act(async () => {
          rendered.stdin.write('\t');
          await rendered.waitUntilReady();
        });
        await act(async () => {
          rendered.stdin.write('\r');
          await rendered.waitUntilReady();
        });
        await waitFor(() =>
          expect(rendered.lastFrame()).toContain(
            locale === 'zh'
              ? '模型偏好未保存'
              : 'Model preference was not saved',
          ),
        );
        expect(rendered.lastFrame()).not.toContain('PRIVATE_WRITE_DETAIL');
        expect(mockOnClose).not.toHaveBeenCalled();
        expect(mockLogModelSlashCommand).not.toHaveBeenCalled();
        await act(async () => {
          rendered.stdin.write('\r');
          await rendered.waitUntilReady();
        });
        await waitFor(() => expect(mockOnClose).toHaveBeenCalledOnce());
        expect(mockSetModel).toHaveBeenNthCalledWith(
          2,
          GEMINI_MODEL_ALIAS_AUTO,
          false,
        );
      } finally {
        rendered.unmount();
      }
    },
  );

  it('renders the initial "main" view correctly', async () => {
    const { lastFrame, unmount } = await renderComponent();
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Remember model for future sessions: false');
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
    unmount();
  });

  it('shows Auto in main view when dynamicModelConfiguration is enabled and user has no preview access', async () => {
    mockGetHasAccessToPreviewModel.mockReturnValue(false);
    const modelConfigService = new ModelConfigService(DEFAULT_MODEL_CONFIGS);
    const dynamicConfig = {
      ...mockConfig,
      getExperimentalDynamicModelConfiguration: () => true,
      getModelConfigService: () => modelConfigService,
    } as unknown as Config;

    const { lastFrame, unmount } = await renderComponent(dynamicConfig);
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
    unmount();
  });

  it('renders the "manual" view initially for users with no pro access and filters Pro models with correct order', async () => {
    mockGetProModelNoAccessSync.mockReturnValue(true);
    mockGetProModelNoAccess.mockResolvedValue(true);
    mockGetHasAccessToPreviewModel.mockReturnValue(true);
    mockGetGemini31FlashLiteLaunchedSync.mockReturnValue(true);
    mockGetDisplayString.mockImplementation((val: string) => val);

    const { lastFrame, unmount } = await renderComponent();

    const output = lastFrame();
    expect(output).toContain('Select Model');
    expect(output).not.toContain(DEFAULT_GEMINI_MODEL);
    expect(output).not.toContain(PREVIEW_GEMINI_MODEL);

    // Verify order: Flash Preview -> Flash Lite (Preview/Default) -> Flash
    const flashPreviewIdx = output.indexOf(PREVIEW_GEMINI_FLASH_MODEL);
    const flashLiteIdx = output.indexOf(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    const flashIdx = output.indexOf(DEFAULT_GEMINI_FLASH_MODEL);

    expect(flashPreviewIdx).toBeLessThan(flashLiteIdx);
    expect(flashLiteIdx).toBeLessThan(flashIdx);

    expect(output).not.toContain('Auto');
    unmount();
  });

  it('closes dialog on escape in "manual" view for users with no pro access', async () => {
    mockGetProModelNoAccessSync.mockReturnValue(true);
    mockGetProModelNoAccess.mockResolvedValue(true);
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Already in manual view
    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('switches to "manual" view when "Manual" is selected and uses getDisplayString for models', async () => {
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === DEFAULT_GEMINI_MODEL) return 'Formatted Pro Model';
      if (val === DEFAULT_GEMINI_FLASH_MODEL) return 'Formatted Flash Model';
      if (val === DEFAULT_GEMINI_FLASH_LITE_MODEL)
        return 'Formatted Lite Model';
      return val;
    });

    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    // Select "Manual" (index 1)
    // Press down arrow to move to "Manual"
    await act(async () => {
      stdin.write('\u001B[B'); // Arrow Down
    });
    await waitUntilReady();

    // Press enter to select
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    // Should now show manual options
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Formatted Pro Model');
      expect(output).toContain('Formatted Flash Model');
      expect(output).toContain('Formatted Lite Model');
    });
    unmount();
  });

  it('sets model and closes when a model is selected in "main" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Select "Auto" (index 0)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(
        GEMINI_MODEL_ALIAS_AUTO,
        true, // Session only by default
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('sets model and closes when a model is selected in "manual" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Navigate to Manual (index 1) and select
    await act(async () => {
      stdin.write('\u001B[B');
    });
    await waitUntilReady();
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    // Now in manual view. Default selection is first item (DEFAULT_GEMINI_MODEL)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL, true);
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('toggles persist mode with Tab key', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    expect(lastFrame()).toContain('Remember model for future sessions: false');

    // Press Tab to toggle persist mode
    await act(async () => {
      stdin.write('\t');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain('Remember model for future sessions: true');
    });

    // Select "Auto" (index 0)
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith(
        GEMINI_MODEL_ALIAS_AUTO,
        false, // Persist enabled
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it.each([false, true])(
    'keeps provider defaults unchanged when selecting an external model (remember=%s)',
    async (remember) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'ultra-dialog-model-scope-'),
      );
      const file = path.join(root, 'providers.json');
      vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', file);
      ProviderManager.resetInstance();
      const manager = ProviderManager.getInstance();
      for (const name of ['first', 'second'])
        manager.upsertProvider({
          name,
          baseUrl: `https://${name}.invalid/v1`,
          apiKey: '',
          models: ['shared'],
          setActive: name === 'first',
        });
      const before = fs.readFileSync(file);
      mockGetModel.mockReturnValue('second:shared');
      const rendered = await renderComponent();
      try {
        if (remember) {
          await act(async () => {
            rendered.stdin.write('\t');
            await rendered.waitUntilReady();
          });
        }
        await act(async () => {
          rendered.stdin.write('\r');
          await rendered.waitUntilReady();
        });
        await waitFor(() =>
          expect(mockSetModel).toHaveBeenCalledWith('second:shared', !remember),
        );
        expect(fs.readFileSync(file).equals(before)).toBe(true);
        expect(manager.getActiveProvider()?.id).toBe('first');
        expect(mockOnClose).toHaveBeenCalled();
      } finally {
        rendered.unmount();
        ProviderManager.resetInstance();
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('closes dialog on escape in "main" view', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('goes back to "main" view on escape in "manual" view', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderComponent();

    // Go to manual view
    await act(async () => {
      stdin.write('\u001B[B');
    });
    await waitUntilReady();
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);
    });

    // Press Escape
    await act(async () => {
      stdin.write('\u001B');
    });
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).not.toHaveBeenCalled();
      // Should be back to main view (Manual option visible)
      expect(lastFrame()).toContain('Manual');
    });
    unmount();
  });

  it('shows the preferred manual model in the main view option using getDisplayString', async () => {
    mockGetModel.mockReturnValue(DEFAULT_GEMINI_MODEL);
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === DEFAULT_GEMINI_MODEL) return 'My Custom Model Display';
      if (val === 'auto') return 'Auto';
      return val;
    });
    const { lastFrame, unmount } = await renderComponent();

    expect(lastFrame()).toContain('Manual (My Custom Model Display)');
    unmount();
  });

  describe('Preview Models', () => {
    beforeEach(() => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
    });

    it('shows Auto in main view when access is granted', async () => {
      const { lastFrame, unmount } = await renderComponent();
      expect(lastFrame()).toContain('Auto');
      unmount();
    });

    it('shows Gemini 3 models in manual view when Gemini 3.1 is NOT launched', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(false);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent();

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toContain(PREVIEW_GEMINI_MODEL);
      expect(output).toContain(PREVIEW_GEMINI_FLASH_MODEL);
      unmount();
    });

    it('shows Gemini 3.1 models in manual view when Gemini 3.1 IS launched', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(true);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent(mockConfig as Config, AuthType.USE_VERTEX_AI);

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toContain(PREVIEW_GEMINI_3_1_MODEL);
      expect(output).toContain(PREVIEW_GEMINI_FLASH_MODEL);
      unmount();
    });

    it('uses custom tools model when Gemini 3.1 IS launched and auth is Gemini API Key', async () => {
      mockGetGemini31LaunchedSync.mockReturnValue(true);
      const { stdin, waitUntilReady, unmount } = await renderComponent(
        mockConfig as Config,
        AuthType.USE_GEMINI,
      );

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      // Select Gemini 3.1 (first item in preview section)
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      await waitFor(() => {
        expect(mockSetModel).toHaveBeenCalledWith(
          PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
          true,
        );
      });
      unmount();
    });

    it('does not show Flash Lite Preview model when it is retired (none) even if flag is enabled', async () => {
      mockGetProModelNoAccessSync.mockReturnValue(false);
      mockGetProModelNoAccess.mockResolvedValue(false);
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetGemini31FlashLiteLaunchedSync.mockReturnValue(true);
      const { lastFrame, stdin, waitUntilReady, unmount } =
        await renderComponent();

      // Go to manual view
      await act(async () => {
        stdin.write('\u001B[B'); // Manual
      });
      await waitUntilReady();
      await act(async () => {
        stdin.write('\r');
      });
      await waitUntilReady();

      const output = lastFrame();
      expect(output).not.toContain(PREVIEW_GEMINI_FLASH_LITE_MODEL);
      expect(output).toContain(DEFAULT_GEMINI_FLASH_LITE_MODEL);
      unmount();
    });
  });
});
