/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, type HistoryItemCompression } from '../types.js';
import { CommandKind, type SlashCommand } from './types.js';

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['压缩', '压缩上下文'],
  description: '压缩长对话历史，提炼关键信息以腾出 Token 上下文窗口',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { ui } = context;
    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Already compressing, wait for previous request to complete',
        },
        Date.now(),
      );
      return;
    }

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

    void (async () => {
      try {
        const promptId = `compress-${Date.now()}`;
        const compressed =
          await context.services.agentContext?.geminiClient?.tryCompressChat(
            promptId,
            true,
          );
        if (compressed) {
          ui.addItem(
            {
              type: MessageType.COMPRESSION,
              compression: {
                isPending: false,
                originalTokenCount: compressed.originalTokenCount,
                newTokenCount: compressed.newTokenCount,
                compressionStatus: compressed.compressionStatus,
              },
            } as HistoryItemCompression,
            Date.now(),
          );
        } else {
          ui.addItem(
            {
              type: MessageType.ERROR,
              text: 'Failed to compress chat history.',
            },
            Date.now(),
          );
        }
      } catch (e) {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to compress chat history: ${
              e instanceof Error ? e.message : String(e)
            }`,
          },
          Date.now(),
        );
      } finally {
        ui.setPendingItem(null);
      }
    })();
  },
};
