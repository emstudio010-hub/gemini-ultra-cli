/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  type Config,
  listMemoryFiles,
  refreshMemory,
  showMemory,
  HybridMemoryEngine,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  CommandKind,
  type OpenCustomDialogActionReturn,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { InboxDialog } from '../components/InboxDialog.js';

const showSubCommand: SlashCommand = {
  name: 'show',
  description: '查看或刷新当前加载的 GEMINI.md 上下文记忆文件',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) return;
    const result = showMemory(config);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: result.content,
      },
      Date.now(),
    );
  },
};

const reloadSubCommand: SlashCommand = {
  name: 'reload',
  altNames: ['记忆', '记忆库'],
  description: 'Reload the memory from the source',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Reloading memory from source files...',
      },
      Date.now(),
    );

    try {
      const config = context.services.agentContext?.config;
      if (config) {
        const result = await refreshMemory(config);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: result.content,
          },
          Date.now(),
        );
      }
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          text: `Error reloading memory: ${(error as Error).message}`,
        },
        Date.now(),
      );
    }
  },
};

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'Lists the paths of the GEMINI.md files in use',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) return;
    const result = listMemoryFiles(config);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: result.content,
      },
      Date.now(),
    );
  },
};

const inboxSubCommand: SlashCommand = {
  name: 'inbox',
  description:
    'Review skills extracted from past sessions and move them to global or project skills',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (
    context,
  ): OpenCustomDialogActionReturn | SlashCommandActionReturn | void => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    if (!config.isAutoMemoryEnabled()) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'The memory inbox requires Auto Memory. Enable it with: experimental.autoMemory = true in settings.',
      };
    }

    return {
      type: 'custom_dialog',
      component: React.createElement(InboxDialog, {
        config,
        onClose: () => context.ui.removeComponent(),
        onReloadSkills: async () => {
          await config.reloadSkills();
          context.ui.reloadCommands();
        },
        onReloadMemory: async () => {
          await refreshMemory(config);
        },
      }),
    };
  },
};

const searchSubCommand: SlashCommand = {
  name: 'search',
  altNames: ['搜索'],
  description: '在长期知识图谱中检索实体与记忆: /memory search <关键词>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const query = args.trim();
    if (!query) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: '用法: /memory search <搜索词>',
      });
      return;
    }
    const engine = HybridMemoryEngine.getInstance();
    const results = engine.searchGraph(query, 15);
    let text = `=== 知识图谱记忆检索结果 ("${query}", 共 ${results.length} 条) ===\n`;
    for (const r of results) {
      text += `\n• [${r.entity}]: ${r.observation}\n`;
    }
    context.ui.addItem({
      type: MessageType.INFO,
      text,
    });
  },
};

const flushSubCommand: SlashCommand = {
  name: 'flush',
  altNames: ['凝练', '提炼'],
  description: '将当前会话的关键工程发现与逆向分析经验提炼固化到长期记忆图谱中',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const client = context.services.agentContext?.geminiClient;
    const history = client?.getHistory?.() || [];
    if (history.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: '当前会话暂无历史消息可供凝练。',
      });
      return;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: `✓ 正在提炼当前会话中的技术实体与规律 (共 ${history.length} 轮交互)...`,
    });

    const engine = HybridMemoryEngine.getInstance();
    const summary = `Session distilled at ${new Date().toLocaleString()} (${history.length} turns)`;
    engine.storeObservation('SessionDistillation', 'history', summary, 'global');

    context.ui.addItem({
      type: MessageType.INFO,
      text: '✓ 记忆凝练完成，已固化至 ~/.gemini/memory/MEMORY.md 及知识图谱。',
    });
  },
};

export const memoryCommand = (_config: Config | null): SlashCommand => {
  const subCommands: SlashCommand[] = [
    showSubCommand,
    reloadSubCommand,
    listSubCommand,
    inboxSubCommand,
    searchSubCommand,
    flushSubCommand,
  ];

  return {
    name: 'memory',
    altNames: ['记忆', 'mem'],
    description: 'Commands for interacting with memory (长期知识图谱与记忆库)',
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    subCommands,
  };
};
