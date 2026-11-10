/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CompressionStatus,
  type ChatCompressionInfo,
  type GeminiClient,
  I18nManager,
} from '@google/gemini-cli-core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compressCommand } from './compressCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('compressCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(I18nManager.getInstance(), 't').mockImplementation(
      (_zh, en) => en,
    );
    mockTryCompressChat = vi.fn();
    context = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: {
            tryCompressChat: mockTryCompressChat,
          } as unknown as GeminiClient,
        },
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('should do nothing if a compression is already pending', async () => {
    context.ui.pendingItem = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
        compressionStatus: null,
      },
    };
    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Already compressing, wait for previous request to complete',
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).not.toHaveBeenCalled();
    expect(mockTryCompressChat).not.toHaveBeenCalled();
  });

  it('should set pending item, call tryCompressChat, and add result on success', async () => {
    const compressedResult: ChatCompressionInfo = {
      originalTokenCount: 200,
      compressionStatus: CompressionStatus.COMPRESSED,
      newTokenCount: 100,
    };
    mockTryCompressChat.mockResolvedValue(compressedResult);

    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(1, {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        compressionStatus: null,
        originalTokenCount: null,
        newTokenCount: null,
      },
    });

    expect(mockTryCompressChat).toHaveBeenCalledWith(
      expect.stringMatching(/^compress-\d+$/),
      true,
      expect.any(AbortSignal),
      { verify: true },
    );

    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.COMPRESSION,
        compression: {
          isPending: false,
          compressionStatus: CompressionStatus.COMPRESSED,
          originalTokenCount: 200,
          newTokenCount: 100,
        },
      },
      expect.any(Number),
    );

    expect(context.ui.setPendingItem).toHaveBeenNthCalledWith(2, null);
  });

  it('should add an error message if tryCompressChat returns falsy', async () => {
    mockTryCompressChat.mockResolvedValue(null);

    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Failed to compress chat history.',
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  it('should add an error message if tryCompressChat throws', async () => {
    const error = new Error('Compression failed');
    mockTryCompressChat.mockRejectedValue(error);

    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: `Failed to compress chat history: ${error.message}`,
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  it('should clear the pending item in a finally block', async () => {
    mockTryCompressChat.mockRejectedValue(new Error('some error'));
    await compressCommand.action!(context, '');
    await new Promise((r) => setTimeout(r, 0));
    expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
  });

  describe('metadata', () => {
    it('should have the correct name and aliases', () => {
      expect(compressCommand.name).toBe('compress');
      expect(compressCommand.altNames).toContain('summarize');
      expect(compressCommand.altNames).toContain('compact');
      expect(compressCommand.isSafeConcurrent).not.toBe(true);
      expect(
        compressCommand.subCommands?.find(
          (command) => command.name === 'cancel',
        )?.isSafeConcurrent,
      ).toBe(true);
    });
  });

  it('requests a single summary pass for fast compression', async () => {
    mockTryCompressChat.mockResolvedValue({
      originalTokenCount: 200,
      newTokenCount: 100,
      compressionStatus: CompressionStatus.COMPRESSED,
    });
    await compressCommand.action!(context, 'fast');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTryCompressChat).toHaveBeenCalledWith(
      expect.any(String),
      true,
      expect.any(AbortSignal),
      { verify: false },
    );
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('one summary pass'),
      }),
      expect.any(Number),
    );
  });

  it('cancels a pending manual operation and allows a new compression afterwards', async () => {
    let signal: AbortSignal | undefined;
    mockTryCompressChat
      .mockImplementationOnce((_id, _force, currentSignal: AbortSignal) => {
        signal = currentSignal;
        return new Promise((_resolve, reject) =>
          currentSignal.addEventListener(
            'abort',
            () => reject(currentSignal.reason),
            { once: true },
          ),
        );
      })
      .mockResolvedValueOnce({
        originalTokenCount: 200,
        newTokenCount: 100,
        compressionStatus: CompressionStatus.COMPRESSED,
      });
    await compressCommand.action!(context, '');
    await compressCommand.subCommands!.find(
      (command) => command.name === 'cancel',
    )!.action!(context, '');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signal?.aborted).toBe(true);
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Compression cancelled; the original context was kept.',
      }),
      expect.any(Number),
    );
    expect(context.ui.setPendingItem).toHaveBeenLastCalledWith(null);
    await compressCommand.action!(context, 'fast');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTryCompressChat).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown arguments without starting a model request', async () => {
    await compressCommand.action!(context, 'unknown');
    expect(mockTryCompressChat).not.toHaveBeenCalled();
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Usage: /compress [fast|cancel]' }),
      expect.any(Number),
    );
  });
});
