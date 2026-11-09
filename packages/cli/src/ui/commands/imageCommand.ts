/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateImage,
  ProviderManager,
} from '@google/gemini-cli-core';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

export const imageCommand: SlashCommand = {
  name: 'image',
  altNames: ['生图', '画图', 'img'],
  description: 'AI 图像生成与生图模型调用。用法: /image <画面描述提示词> [--model=模型名]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'model',
      altNames: ['模型'],
      description: '配置或切换当前生图模型: /image model <模型名> [供应商名称]',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
          const mgr = ProviderManager.getInstance();
          const active = mgr.getActiveImageModel();
          context.ui.addItem({
            type: MessageType.INFO,
            text: `当前生图模型: [${active.modelId || '自动选择'}] (供应商: ${active.provider?.name || '默认'})\n设置方法: /image model <模型名> [供应商名称]`,
          });
          return;
        }
        const [modelName, providerName] = parts;
        const mgr = ProviderManager.getInstance();
        const p = providerName ? mgr.getProvider(providerName) : mgr.getActiveProvider();
        mgr.setActiveImageModel(p?.id, modelName);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `✓ 生图模型已设定为: [${modelName}] (绑定供应商: ${p?.name || '默认'})`,
        });
      },
    },
  ],
  action: async (context: CommandContext, args: string) => {
    const trimmed = args.trim();
    if (!trimmed) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: '用法:\n• /image <提示词> - 根据提示词生成图像\n• /image model <模型名> - 切换生图模型 (如 dall-e-3, flux-1, recraft-v3)',
      });
      return;
    }

    if (trimmed.startsWith('model')) {
      const modelCmd = imageCommand.subCommands?.find((c) => c.name === 'model');
      return modelCmd?.action?.(context, trimmed.replace(/^model\s*/, ''));
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: `正在请求生图模型绘制: "${trimmed}"，请稍候...`,
    });

    const workspaceDir = context.services.agentContext?.config?.getTargetDir?.() || process.cwd();
    const res = await generateImage({
      prompt: trimmed,
      workspaceDir,
    });

    if (res.success && res.filePath) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: `✓ 图像生成成功！\n文件保存至: ${res.filePath}\n预览语法: ${res.markdownLink}`,
      });
    } else {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `生图失败: ${res.error}`,
      });
    }
  },
};
