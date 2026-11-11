/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import {
  ProviderManager,
  PROVIDER_PRESET_TEMPLATES,
  I18nManager,
  ProviderConfigConflictError,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { ProviderConfigDialog } from '../components/ProviderConfigDialog.js';

const t = (zh: string, en: string) => I18nManager.getInstance().t(zh, en);

function syncSession(context: CommandContext): void {
  const mgr = ProviderManager.getInstance();
  const provider = mgr.getActiveProvider();
  const model = mgr.getActiveModel();
  if (provider && model)
    context.services.agentContext?.config.setModel(`${provider.id}:${model}`);
  context.ui.reloadCommands();
}
function reportError(context: CommandContext, error: unknown): void {
  context.ui.addItem({
    type: MessageType.ERROR,
    text:
      error instanceof ProviderConfigConflictError
        ? error.message
        : t(
            '供应商设置失败，请检查输入参数和配置文件写入权限。',
            'Provider change failed. Check the inputs and configuration file permissions.',
          ) + (error instanceof Error ? ` (${error.name})` : ''),
  });
}

export const providerCommand: SlashCommand = {
  name: 'provider',
  altNames: ['供应商', '接口', 'p'],
  get description() {
    return t(
      '管理模型供应商：/provider 打开配置，list 查看，use <名称或ID> 切换',
      'Manage model providers: /provider configures, list shows, use <name or ID> switches',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      altNames: ['列表', 'ls'],
      get description() {
        return t(
          '列出已配置供应商与预设模板',
          'List configured providers and presets',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const mgr = ProviderManager.getInstance();
        const providers = mgr.listProviders();
        const active = mgr.getActiveProvider();
        let text = t('已配置的供应商\n', 'Configured providers\n');
        if (!providers.length)
          text += t(
            '尚未配置外接供应商。\n',
            'No external providers configured.\n',
          );
        for (const provider of providers) {
          const marker =
            provider.id === active?.id ? t(' [活跃]', ' [active]') : '';
          text += `\n${provider.name} (${provider.id})${marker}\n`;
          text += t('端点', 'Endpoint') + `: ${provider.baseUrl}\n`;
          text += t('协议', 'Protocol') + `: ${provider.protocol}\n`;
          text +=
            t('模型', 'Models') +
            `: ${provider.models.join(', ') || t('无', 'none')}\n`;
          text +=
            t('默认模型', 'Default model') +
            `: ${provider.defaultModel || t('未设置', 'not set')}\n`;
        }
        text += t('\n预设模板\n', '\nPresets\n');
        for (const preset of PROVIDER_PRESET_TEMPLATES)
          text += `${preset.id === 'custom-openai' ? t('自定义端点', 'Custom endpoint') : preset.name}: ${preset.defaultBaseUrl}\n`;
        text += t(
          '\n输入 /provider 添加或编辑供应商；/provider use <名称或ID> 切换。',
          '\nUse /provider to add or edit a provider; /provider use <name or ID> to switch.',
        );
        context.ui.addItem({ type: MessageType.INFO, text });
      },
    },
    {
      name: 'add',
      altNames: ['添加'],
      get description() {
        return t(
          '添加或更新：/provider add <名称> <URL> <Key> [模型]',
          'Add or update: /provider add <name> <URL> <key> [model]',
        );
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: async (context: CommandContext, args: string) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 3 || parts.length > 4) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: t(
              '用法：/provider add <名称> <URL> <Key> [模型]；手填模型时跳过列表获取。',
              'Usage: /provider add <name> <URL> <key> [model]; a named model skips catalog discovery.',
            ),
          });
          return;
        }
        const [name, baseUrl, apiKey, defaultModel] = parts;
        const mgr = ProviderManager.getInstance();
        try {
          let models = defaultModel
            ? [...(mgr.getProvider(name)?.models ?? []), defaultModel]
            : [];
          if (!defaultModel) {
            context.ui.addItem({
              type: MessageType.INFO,
              text: t('正在获取模型列表…', 'Fetching the model catalog…'),
            });
            const fetched = await mgr.fetchModelsFromEndpoint({
              baseUrl,
              apiKey,
            });
            models = fetched.models;
            if (!models.length) {
              context.ui.addItem({
                type: MessageType.ERROR,
                text: t(
                  '未获取到模型，配置尚未保存。请在命令末尾手填模型名，或使用 /provider 编辑。',
                  'No models found; configuration was not saved. Supply a model name or edit with /provider.',
                ),
              });
              return;
            }
          }
          const profile = mgr.upsertProvider({
            name,
            baseUrl,
            apiKey,
            models,
            defaultModel: defaultModel || models[0],
            setActive: true,
          });
          syncSession(context);
          context.ui.addItem({
            type: MessageType.INFO,
            text: t(
              `已保存并切换到 ${profile.name}，当前模型：${profile.defaultModel}`,
              `Saved and switched to ${profile.name}. Current model: ${profile.defaultModel}`,
            ),
          });
        } catch (error) {
          reportError(context, error);
        }
      },
    },
    {
      name: 'use',
      altNames: ['切换', '激活'],
      get description() {
        return t(
          '切换供应商：/provider use <名称或ID>',
          'Switch provider: /provider use <name or ID>',
        );
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: async (context: CommandContext, args: string) => {
        const target = args.trim();
        const mgr = ProviderManager.getInstance();
        const provider = target ? mgr.getProvider(target) : undefined;
        if (!provider) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: target
              ? t(
                  '未找到供应商，请用 /provider list 查看名称或ID。',
                  'Provider not found. Use /provider list to see names and IDs.',
                )
              : t(
                  '用法：/provider use <名称或ID>',
                  'Usage: /provider use <name or ID>',
                ),
          });
          return;
        }
        const model = provider.defaultModel || provider.models[0];
        if (!model) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: t(
              '该供应商尚无模型，请先用 /provider 配置。',
              'This provider has no model. Configure it with /provider first.',
            ),
          });
          return;
        }
        try {
          mgr.setActiveSelection(provider.id, model);
          syncSession(context);
          context.ui.addItem({
            type: MessageType.INFO,
            text: t(
              `已切换到 ${provider.name}，当前模型：${model}`,
              `Switched to ${provider.name}. Current model: ${model}`,
            ),
          });
        } catch (error) {
          reportError(context, error);
        }
      },
      completion: async (_context, partial) =>
        ProviderManager.getInstance()
          .listProviders()
          .filter(
            (provider) =>
              provider.id.toLowerCase().startsWith(partial.toLowerCase()) ||
              provider.name.toLowerCase().startsWith(partial.toLowerCase()),
          )
          .map((provider) => provider.id),
    },
  ],
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<void | SlashCommandActionReturn> => {
    const trimmed = args.trim();
    if (trimmed) {
      const [sub, ...rest] = trimmed.split(/\s+/);
      const matched = providerCommand.subCommands?.find(
        (command) => command.name === sub || command.altNames?.includes(sub),
      );
      if (matched?.action) return matched.action(context, rest.join(' '));
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t(
          '用法：/provider [list|add|use]，无参数打开配置。',
          'Usage: /provider [list|add|use]; no arguments opens configuration.',
        ),
      });
      return;
    }
    try {
      ProviderManager.getInstance().reloadFromDisk();
    } catch (error) {
      reportError(context, error);
      return;
    }
    return {
      type: 'custom_dialog',
      component: React.createElement(ProviderConfigDialog, {
        onClose: () => {
          syncSession(context);
          context.ui.removeComponent();
        },
      }),
    };
  },
};
