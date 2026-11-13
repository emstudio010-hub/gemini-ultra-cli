/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { I18nManager, ProviderManager } from '@google/gemini-cli-core';
import { modelCommand } from './modelCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-model-command-'));
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(root, 'providers.json'),
    );
    vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
    ProviderManager.resetInstance();
    I18nManager.getInstance().setLocale('en');
    mockContext = createMockCommandContext();
  });

  afterEach(() => {
    ProviderManager.resetInstance();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('switches model descriptions and feedback language while preserving qualified routes and save scope', async () => {
    const manager = ProviderManager.getInstance();
    manager.upsertProvider({
      name: 'Local',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: 'FAKE_SECRET',
      models: ['model@version'],
      setActive: true,
    });
    const originalProviders = fs.readFileSync(
      path.join(root, 'providers.json'),
    );
    const setModel = vi.fn();
    mockContext.services.agentContext = {
      config: {
        setModel,
        getUsageStatisticsEnabled: () => false,
      } as unknown as Config,
    } as Config;
    const set = modelCommand.subCommands!.find(
      (command) => command.name === 'set',
    )!;
    const manage = modelCommand.subCommands!.find(
      (command) => command.name === 'manage',
    )!;
    for (const locale of ['zh', 'en', 'zh'] as const) {
      I18nManager.getInstance().setLocale(locale);
      const zh = locale === 'zh';
      expect(modelCommand.description).toBe(
        zh ? '管理模型配置' : 'Manage model configuration',
      );
      expect(set.description).toBe(
        zh
          ? '切换当前模型；添加 --persist 记住供后续会话使用'
          : 'Switch the current model; add --persist to remember it for future sessions',
      );
      expect(manage.description).toBe(
        zh ? '打开模型选择窗口' : 'Open the model selector',
      );
      vi.mocked(mockContext.ui.addItem).mockClear();
      await set.action!(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith({
        type: MessageType.ERROR,
        text: zh
          ? '用法：/model set <模型名称或供应商ID:模型ID> [--persist]'
          : 'Usage: /model set <model-name or provider-id:model-id> [--persist]',
      });
      await modelCommand.action!(mockContext, 'unknown-route');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith({
        type: MessageType.ERROR,
        text: zh
          ? '无效模型“unknown-route”。请运行 /model 查看并选择可用模型。'
          : 'Invalid model "unknown-route". Run /model to view and select from available models.',
      });
      for (const persist of [false, true]) {
        await set.action!(
          mockContext,
          `local:model@version${persist ? ' --persist' : ''}`,
        );
        expect(setModel).toHaveBeenLastCalledWith(
          'local:model@version',
          !persist,
        );
        expect(mockContext.ui.addItem).toHaveBeenLastCalledWith({
          type: MessageType.INFO,
          text: zh
            ? `模型已切换为 local:model@version${persist ? '（已记住，供后续会话使用）' : '（仅本次会话）'}`
            : `Model set to local:model@version${persist ? ' (persisted)' : ' (this session only)'}`,
        });
      }
    }
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      originalProviders,
    );
    expect(
      JSON.stringify(vi.mocked(mockContext.ui.addItem).mock.calls),
    ).not.toContain('FAKE_SECRET');
  });

  it.each([
    'gemini-2.5-pro gemini-2.5-flash --persist',
    'gemini-2.5-pro --persit',
    '--persist',
    'gemini-2.5-pro --persist --persist',
  ])(
    'rejects malformed model input without applying a partial selection: %s',
    async (args) => {
      const setModel = vi.fn();
      mockContext.services.agentContext = {
        config: {
          setModel,
          getUsageStatisticsEnabled: () => false,
        } as unknown as Config,
      } as Config;
      await modelCommand.action!(mockContext, args);
      expect(setModel).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledOnce();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Usage: /model set'),
        }),
      );
    },
  );

  it.each(['zh', 'en'] as const)(
    'reports unavailable model configuration in %s without claiming success',
    async (locale) => {
      I18nManager.getInstance().setLocale(locale);
      mockContext.services.agentContext = null;
      await modelCommand.action!(mockContext, 'gemini-2.5-pro');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith({
        type: MessageType.ERROR,
        text:
          locale === 'zh'
            ? '模型配置尚未就绪，请初始化完成后重试。'
            : 'Model configuration is not ready. Try again after initialization.',
      });
    },
  );

  it('should return a dialog action to open the model dialog when no args', async () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const result = await modelCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'model',
    });
  });

  it('opens the dialog without starting or waiting for quota refresh', async () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const mockRefreshUserQuota = vi.fn(() => new Promise<never>(() => {}));
    mockContext.services.agentContext = {
      refreshUserQuota: mockRefreshUserQuota,
      get config() {
        return this;
      },
    } as unknown as Config;

    let result: unknown;
    const pending = Promise.resolve(modelCommand.action(mockContext, '')).then(
      (value) => {
        result = value;
      },
    );
    await vi.waitFor(() =>
      expect(result).toEqual({ type: 'dialog', dialog: 'model' }),
    );
    expect(mockRefreshUserQuota).not.toHaveBeenCalled();
    await pending;
  });

  describe('manage subcommand', () => {
    it('should return a dialog action to open the model dialog', async () => {
      const manageCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'manage',
      );
      expect(manageCommand).toBeDefined();

      const result = await manageCommand!.action!(mockContext, '');

      expect(result).toEqual({
        type: 'dialog',
        dialog: 'model',
      });
    });

    it('opens manage immediately without waiting for quota refresh', async () => {
      const manageCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'manage',
      );
      const mockRefreshUserQuota = vi.fn(() => new Promise<never>(() => {}));
      mockContext.services.agentContext = {
        refreshUserQuota: mockRefreshUserQuota,
        get config() {
          return this;
        },
      } as unknown as Config;

      let result: unknown;
      const pending = Promise.resolve(
        manageCommand!.action!(mockContext, ''),
      ).then((value) => {
        result = value;
      });
      await vi.waitFor(() =>
        expect(result).toEqual({ type: 'dialog', dialog: 'model' }),
      );
      expect(mockRefreshUserQuota).not.toHaveBeenCalled();
      await pending;
    });
  });

  describe('set subcommand', () => {
    it('reports a preferred model save failure without claiming persistence', async () => {
      const setCommand = modelCommand.subCommands!.find(
        (command) => command.name === 'set',
      )!;
      mockContext.services.agentContext = {
        setModel: () => {
          throw new Error('PRIVATE_WRITE_DETAIL');
        },
        get config() {
          return this;
        },
      } as unknown as Config;
      await expect(
        setCommand.action!(mockContext, 'gemini-2.5-pro --persist'),
      ).resolves.toBeUndefined();
      expect(mockContext.ui.addItem).toHaveBeenCalledOnce();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
      expect(
        JSON.stringify(vi.mocked(mockContext.ui.addItem).mock.calls),
      ).not.toContain('PRIVATE_WRITE_DETAIL');
    });

    it('should set the model and log the command', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      expect(setCommand).toBeDefined();

      const mockSetModel = vi.fn();
      mockContext.services.agentContext = {
        setModel: mockSetModel,
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
        getUserId: vi.fn().mockReturnValue('test-user'),
        getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
        getSessionId: vi.fn().mockReturnValue('test-session'),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: 'test-auth' }),
        isInteractive: vi.fn().mockReturnValue(true),
        getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
        getPolicyEngine: vi.fn().mockReturnValue({
          getApprovalMode: vi.fn().mockReturnValue('auto'),
        }),
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand!.action!(mockContext, 'gemini-2.5-pro');

      expect(mockSetModel).toHaveBeenCalledWith('gemini-2.5-pro', true);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Model set to gemini-2.5-pro'),
        }),
      );
    });

    it('should set the model with persistence when --persist is used', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      const mockSetModel = vi.fn();
      mockContext.services.agentContext = {
        setModel: mockSetModel,
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
        getUserId: vi.fn().mockReturnValue('test-user'),
        getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
        getSessionId: vi.fn().mockReturnValue('test-session'),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: 'test-auth' }),
        isInteractive: vi.fn().mockReturnValue(true),
        getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
        getPolicyEngine: vi.fn().mockReturnValue({
          getApprovalMode: vi.fn().mockReturnValue('auto'),
        }),
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand!.action!(mockContext, 'gemini-2.5-pro --persist');

      expect(mockSetModel).toHaveBeenCalledWith('gemini-2.5-pro', false);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            'Model set to gemini-2.5-pro (persisted)',
          ),
        }),
      );
    });

    it('should show error if no model name is provided', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      await setCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining(
            'Usage: /model set <model-name or provider-id:model-id>',
          ),
        }),
      );
    });

    it('should show usage error if only --persist flag is provided without a model name', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      const mockSetModel = vi.fn();
      mockContext.services.agentContext = {
        setModel: mockSetModel,
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand?.action?.(mockContext, '--persist');

      expect(mockSetModel).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining(
            'Usage: /model set <model-name or provider-id:model-id>',
          ),
        }),
      );
    });

    it('should reject invalid model names and not update the configured model', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      const mockSetModel = vi.fn();
      mockContext.services.agentContext = {
        setModel: mockSetModel,
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand?.action?.(mockContext, 'nonexistent-model-name');

      expect(mockSetModel).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining(
            'Invalid model "nonexistent-model-name"',
          ),
        }),
      );
    });

    it('should accept custom model aliases configured in settings', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      const mockSetModel = vi.fn();
      mockContext.services.agentContext = {
        setModel: mockSetModel,
        getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
        getUserId: vi.fn().mockReturnValue('test-user'),
        getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
        getSessionId: vi.fn().mockReturnValue('test-session'),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: 'test-auth' }),
        isInteractive: vi.fn().mockReturnValue(true),
        getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
        getPolicyEngine: vi.fn().mockReturnValue({
          getApprovalMode: vi.fn().mockReturnValue('auto'),
        }),
        get config() {
          return this;
        },
      } as unknown as Config;
      mockContext.services.settings.merged.modelConfigs = {
        ...mockContext.services.settings.merged.modelConfigs,
        customAliases: {
          'my-custom-alias': {
            modelConfig: { model: 'gemini-2.5-flash' },
          },
        },
      };

      await setCommand?.action?.(mockContext, 'my-custom-alias');

      expect(mockSetModel).toHaveBeenCalledWith('my-custom-alias', true);
    });

    it('should provide completion suggestions matching partial model names', async () => {
      const setCommand = modelCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      expect(setCommand?.completion).toBeDefined();

      const suggestions = await setCommand?.completion?.(
        mockContext,
        'gemini-2.5',
      );
      expect(suggestions).toBeDefined();
      expect(suggestions).toContain('gemini-2.5-pro');
      expect(suggestions).toContain('gemini-2.5-flash');
      expect(suggestions?.every((s) => s.startsWith('gemini-2.5'))).toBe(true);
    });
  });

  it('should forward arguments directly on /model <model-name> to set subcommand', async () => {
    const mockSetModel = vi.fn();
    mockContext.services.agentContext = {
      setModel: mockSetModel,
      getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
      getUserId: vi.fn().mockReturnValue('test-user'),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: 'test-auth' }),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getPolicyEngine: vi.fn().mockReturnValue({
        getApprovalMode: vi.fn().mockReturnValue('auto'),
      }),
      get config() {
        return this;
      },
    } as unknown as Config;

    await modelCommand.action?.(mockContext, 'gemini-2.5-flash');

    expect(mockSetModel).toHaveBeenCalledWith('gemini-2.5-flash', true);
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Model set to gemini-2.5-flash'),
      }),
    );
  });

  it('should have the correct name and description', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe('Manage model configuration');
  });
});
