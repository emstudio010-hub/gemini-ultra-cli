/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nManager, type GeminiClient } from '@google/gemini-cli-core';
import { MessageType, type HistoryItemCompression } from '../types.js';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

const activeCompressions = new WeakMap<GeminiClient, AbortController>();
const t = (zh: string, en: string) => I18nManager.getInstance().t(zh, en);

function cancelCompression(context: CommandContext): void {
  const client = context.services.agentContext?.geminiClient;
  const controller = client && activeCompressions.get(client);
  if (controller) {
    controller.abort(
      new DOMException('Compression cancelled by user', 'AbortError'),
    );
    return;
  }
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: t(
        '没有正在运行的手动压缩。自动压缩可按 Esc 取消当前请求。',
        'No manual compression is running. Press Esc to cancel a request during automatic compression.',
      ),
    },
    Date.now(),
  );
}

function startCompression(context: CommandContext, verify: boolean): void {
  const { ui } = context;
  const client = context.services.agentContext?.geminiClient;
  if (ui.pendingItem || (client && activeCompressions.has(client))) {
    ui.addItem(
      {
        type: MessageType.ERROR,
        text: t(
          '已有操作正在进行，请等待或使用 /compress cancel 取消手动压缩。',
          'Already compressing, wait for previous request to complete',
        ),
      },
      Date.now(),
    );
    return;
  }
  if (!client) {
    ui.addItem(
      {
        type: MessageType.ERROR,
        text: t('无法压缩对话历史。', 'Failed to compress chat history.'),
      },
      Date.now(),
    );
    return;
  }
  const controller = new AbortController();
  activeCompressions.set(client, controller);
  const pendingMessage: HistoryItemCompression = {
    type: MessageType.COMPRESSION,
    compression: {
      isPending: true,
      originalTokenCount: null,
      newTokenCount: null,
      compressionStatus: null,
    },
  };
  ui.setPendingItem(pendingMessage);
  ui.addItem(
    {
      type: MessageType.INFO,
      text: verify
        ? t(
            '正在压缩并复核摘要；可输入 /compress cancel 取消。',
            'Compressing and reviewing the summary; use /compress cancel to cancel.',
          )
        : t(
            '正在快速压缩，仅生成一次摘要；可输入 /compress cancel 取消。',
            'Fast compression uses one summary pass; use /compress cancel to cancel.',
          ),
    },
    Date.now(),
  );

  void (async () => {
    try {
      const compressed = await client.tryCompressChat(
        'compress-' + Date.now(),
        true,
        controller.signal,
        { verify },
      );
      if (compressed) {
        const resultMessage: HistoryItemCompression = {
          type: MessageType.COMPRESSION,
          compression: {
            isPending: false,
            originalTokenCount: compressed.originalTokenCount,
            newTokenCount: compressed.newTokenCount,
            compressionStatus: compressed.compressionStatus,
          },
        };
        ui.addItem(resultMessage, Date.now());
      } else {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: t('无法压缩对话历史。', 'Failed to compress chat history.'),
          },
          Date.now(),
        );
      }
    } catch (error) {
      ui.addItem(
        controller.signal.aborted
          ? {
              type: MessageType.INFO,
              text: t(
                '压缩已取消，原上下文保留。',
                'Compression cancelled; the original context was kept.',
              ),
            }
          : {
              type: MessageType.ERROR,
              text:
                t('压缩对话历史失败：', 'Failed to compress chat history: ') +
                (error instanceof Error ? error.message : String(error)),
            },
        Date.now(),
      );
    } finally {
      if (activeCompressions.get(client) === controller) {
        activeCompressions.delete(client);
        ui.setPendingItem(null);
      }
    }
  })();
}

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['压缩', '压缩上下文', 'summarize', 'compact'],
  get description() {
    return t(
      '压缩长对话；fast 快速摘要，cancel 取消手动压缩',
      'Compress history; fast for one pass, cancel to stop manual compression',
    );
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context, args) => {
    switch (args.trim().toLowerCase()) {
      case '':
        startCompression(context, true);
        return;
      case 'fast':
      case '快速':
        startCompression(context, false);
        return;
      case 'cancel':
      case '取消':
        cancelCompression(context);
        return;
      default:
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: t(
              '用法：/compress [fast|cancel]',
              'Usage: /compress [fast|cancel]',
            ),
          },
          Date.now(),
        );
    }
  },
  subCommands: [
    {
      name: 'fast',
      altNames: ['快速'],
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      get description() {
        return t('快速压缩，只生成一次摘要', 'Compress with one summary pass');
      },
      action: (context) => startCompression(context, false),
    },
    {
      name: 'cancel',
      altNames: ['取消'],
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      get description() {
        return t('取消当前手动压缩', 'Cancel manual compression');
      },
      action: cancelCompression,
    },
  ],
};
