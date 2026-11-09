/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ProviderManager,
  PROVIDER_PRESET_TEMPLATES,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { ProviderConfigDialog } from '../components/ProviderConfigDialog.js';

export const providerCommand: SlashCommand = {
  name: 'provider',
  altNames: ['供应商', '接口', 'p'],
  description:
    '管理外接大模型供应商 (ZCode/GrokBuild/MimoCode/OpenCode/Custom)。用法: /provider [list | add <名称> <URL> <Key> [模型] | use <名称>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      altNames: ['列表', 'ls'],
      description: '列出所有已配置的外接供应商与预设模板',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const mgr = ProviderManager.getInstance();
        const providers = mgr.listProviders();
        const active = mgr.getActiveProvider();

        let text = '=== 当前已配置的外接供应商 ===\n';
        if (providers.length === 0) {
          text += '（暂未配置任何外接供应商，当前使用 Gemini 官方通道）\n';
        } else {
          for (const p of providers) {
            const isAct = p.id === active?.id ? ' ★ [活跃]' : '';
            text += `\n• ${p.name} (${p.id})${isAct}\n  端点: ${p.baseUrl}\n  协议: ${p.protocol}\n  模型: ${p.models.join(', ') || '无'}\n  默认模型: ${p.defaultModel || '无'}\n`;
          }
        }

        text += '\n=== 可用的预设模板 (快捷接入) ===\n';
        for (const t of PROVIDER_PRESET_TEMPLATES) {
          text += `• ${t.name}: ${t.description} (URL: ${t.defaultBaseUrl})\n`;
        }
        text += '\n提示: 可使用 `/供应商 add <名称> <URL> <Key> [模型名]` 快速添加。';

        context.ui.addItem({
          type: MessageType.INFO,
          text,
        });
      },
    },
    {
      name: 'add',
      altNames: ['添加'],
      description: '添加或更新供应商: /provider add <名称> <URL> <Key> [模型名]',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 3) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '用法: /provider add <名称> <BaseURL> <API-Key> [默认模型名]',
          });
          return;
        }

        const [name, baseUrl, apiKey, defaultModel] = parts;
        const mgr = ProviderManager.getInstance();

        context.ui.addItem({
          type: MessageType.INFO,
          text: `正在连接 ${baseUrl} 探测可用模型列表...`,
        });

        const fetched = await mgr.fetchModelsFromEndpoint({ baseUrl, apiKey });
        const models = fetched.models.length > 0 ? fetched.models : (defaultModel ? [defaultModel] : []);

        const profile = mgr.upsertProvider({
          name,
          baseUrl,
          apiKey,
          models,
          defaultModel: defaultModel || models[0],
          setActive: true,
        });

        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 成功保存并激活供应商 [${profile.name}]！\n已拉取/录入模型: ${profile.models.slice(0, 8).join(', ')}${profile.models.length > 8 ? ' ...' : ''}\n当前默认模型已设为: ${profile.defaultModel}`,
        });
      },
    },
    {
      name: 'use',
      altNames: ['切换', '激活'],
      description: '激活指定供应商: /provider use <名称/ID>',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const target = args.trim();
        if (!target) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '用法: /provider use <供应商名称或ID>',
          });
          return;
        }

        const mgr = ProviderManager.getInstance();
        const p = mgr.getProvider(target);
        if (!p) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `未找到供应商 "${target}"，请先使用 /provider list 查看。`,
          });
          return;
        }

        mgr.setActiveSelection(p.id, p.defaultModel);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 当前活跃供应商已切换为: [${p.name}]，默认模型: ${p.defaultModel || '未设置'}`,
        });
      },
    },
  ],
  action: async (context: CommandContext, args: string): Promise<void | SlashCommandActionReturn> => {
    const trimmed = args.trim();
    if (!trimmed) {
      return {
        type: 'custom_dialog',
        component: React.createElement(ProviderConfigDialog, {
          onClose: () => {
            const mgr = ProviderManager.getInstance();
            const provider = mgr.getActiveProvider();
            const model = mgr.getActiveModel();
            if (provider && model) context.services.agentContext?.config.setModel(`${provider.id}:${model}`);
            context.ui.reloadCommands();
            context.ui.removeComponent();
          },
        }),
      };
    }
    if (trimmed === 'list' || trimmed === '列表') {
      const listCmd = providerCommand.subCommands?.find((c) => c.name === 'list');
      return listCmd?.action?.(context, '');
    }
    const parts = trimmed.split(/\s+/);
    const sub = parts[0];
    const subArgs = parts.slice(1).join(' ');

    const matched = providerCommand.subCommands?.find(
      (c) => c.name === sub || c.altNames?.includes(sub),
    );
    if (matched?.action) {
      return matched.action(context, subArgs);
    }

    return {
      type: 'custom_dialog',
      component: React.createElement(ProviderConfigDialog, {
        onClose: () => context.ui.removeComponent(),
      }),
    };
  },
};
