/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_MODEL_CONFIGS,
  GEMINI_MODEL_ALIAS_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  ModelSlashCommandEvent,
  PREVIEW_GEMINI_MODEL_AUTO,
  VALID_GEMINI_MODELS,
  logModelSlashCommand,
  ProviderManager,
  I18nManager,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import { modelSaveError } from '../utils/modelSaveError.js';

const t = (zh: string, en: string) => I18nManager.getInstance().t(zh, en);

function getValidModelNames(context: CommandContext): Set<string> {
  const validModels = new Set<string>([
    ...Array.from(VALID_GEMINI_MODELS).filter((model) => model !== 'none'),
    ...Object.keys(DEFAULT_MODEL_CONFIGS.modelDefinitions ?? {}),
    GEMINI_MODEL_ALIAS_AUTO,
    GEMINI_MODEL_ALIAS_PRO,
    GEMINI_MODEL_ALIAS_FLASH,
    GEMINI_MODEL_ALIAS_FLASH_LITE,
    PREVIEW_GEMINI_MODEL_AUTO,
    DEFAULT_GEMINI_MODEL_AUTO,
  ]);

  const config = context.services.agentContext?.config;
  const serviceDefinitions = config
    ?.getModelConfigService?.()
    ?.getModelDefinitions?.();
  if (serviceDefinitions) {
    for (const model of Object.keys(serviceDefinitions)) {
      validModels.add(model);
    }
  }

  const modelConfigs = context.services.settings?.merged?.modelConfigs;
  if (modelConfigs?.customAliases) {
    for (const alias of Object.keys(modelConfigs.customAliases)) {
      validModels.add(alias);
    }
  }
  if (modelConfigs?.modelDefinitions) {
    for (const model of Object.keys(modelConfigs.modelDefinitions)) {
      validModels.add(model);
    }
  }

  // Include external provider models
  try {
    const extItems = ProviderManager.getInstance().getAllExternalModelItems();
    for (const item of extItems) {
      validModels.add(item.modelId);
      validModels.add(item.qualifiedId);
    }
  } catch {
    // Native and configured aliases remain available if provider loading fails.
  }

  return validModels;
}

const setModelCommand: SlashCommand = {
  name: 'set',
  get description() {
    return t(
      '切换当前模型；添加 --persist 记住供后续会话使用',
      'Switch the current model; add --persist to remember it for future sessions',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const persist = parts.includes('--persist');
    const nonFlagParts = parts.filter((part) => part !== '--persist');

    if (
      nonFlagParts.length !== 1 ||
      parts.length !== (persist ? 2 : 1) ||
      nonFlagParts[0].startsWith('--')
    ) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t(
          '用法：/model set <模型名称或供应商ID:模型ID> [--persist]',
          'Usage: /model set <model-name or provider-id:model-id> [--persist]',
        ),
      });
      return;
    }

    const modelName = nonFlagParts[0];
    const validModels = getValidModelNames(context);
    if (!validModels.has(modelName)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t(
          `无效模型“${modelName}”。请运行 /model 查看并选择可用模型。`,
          `Invalid model "${modelName}". Run /model to view and select from available models.`,
        ),
      });
      return;
    }

    const config = context.services.agentContext?.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t(
          '模型配置尚未就绪，请初始化完成后重试。',
          'Model configuration is not ready. Try again after initialization.',
        ),
      });
      return;
    }
    try {
      config.setModel(modelName, !persist);
    } catch {
      context.ui.addItem({ type: MessageType.ERROR, text: modelSaveError() });
      return;
    }
    const event = new ModelSlashCommandEvent(modelName);
    logModelSlashCommand(config, event);

    context.ui.addItem({
      type: MessageType.INFO,
      text: t(
        `模型已切换为 ${modelName}${persist ? '（已记住，供后续会话使用）' : '（仅本次会话）'}`,
        `Model set to ${modelName}${persist ? ' (persisted)' : ' (this session only)'}`,
      ),
    });
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const validModels = Array.from(getValidModelNames(context));
    return validModels.filter((model) => model.startsWith(partialArg));
  },
};

const manageModelCommand: SlashCommand = {
  name: 'manage',
  get description() {
    return t('打开模型选择窗口', 'Open the model selector');
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async () => ({
    type: 'dialog',
    dialog: 'model',
  }),
};

export const modelCommand: SlashCommand = {
  name: 'model',
  altNames: ['模型', 'm'],
  get description() {
    return t('管理模型配置', 'Manage model configuration');
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [manageModelCommand, setModelCommand],
  action: async (context: CommandContext, args: string) => {
    if (args.trim().length > 0) {
      return setModelCommand.action?.(context, args);
    }
    return manageModelCommand.action?.(context, args);
  },
};
