/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { coreEvents, I18nManager } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';
import { isSlashCommand } from '../utils/commandUtils.js';

export interface UseMessageQueueOptions {
  isConfigInitialized: boolean;
  areCommandsReady?: boolean;
  streamingState: StreamingState;
  submitQuery: (query: string) => void | Promise<unknown>;
  isMcpReady: boolean;
  isCompressing?: boolean;
}

export interface UseMessageQueueReturn {
  messageQueue: string[];
  addMessage: (message: string) => void;
  clearQueue: () => void;
  getQueuedMessagesText: () => string;
  popAllMessages: () => string | undefined;
}

/**
 * Hook for managing message queuing during streaming responses.
 * Allows users to queue messages while the AI is responding and automatically
 * sends them when streaming completes.
 */
export function useMessageQueue({
  isConfigInitialized,
  areCommandsReady = true,
  streamingState,
  submitQuery,
  isMcpReady,
  isCompressing = false,
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Add a message to the queue
  const addMessage = useCallback((message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 0) {
      setMessageQueue((prev) => [...prev, trimmedMessage]);
    }
  }, []);

  // Clear the entire queue
  const clearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Get all queued messages as a single text string
  const getQueuedMessagesText = useCallback(() => {
    if (messageQueue.length === 0) return '';
    return messageQueue.join('\n\n');
  }, [messageQueue]);

  // Pop all messages from the queue and return them as a single string
  const popAllMessages = useCallback(() => {
    if (messageQueue.length === 0) {
      return undefined;
    }
    const allMessages = messageQueue.join('\n\n');
    setMessageQueue([]);
    return allMessages;
  }, [messageQueue]);

  // Process queued messages when streaming becomes idle
  useEffect(() => {
    if (
      isConfigInitialized &&
      areCommandsReady &&
      !isSubmitting &&
      !submissionInFlight.current &&
      streamingState === StreamingState.Idle &&
      !isCompressing &&
      messageQueue.length > 0
    ) {
      // A command is a separate action, never an argument of a previous
      // command or part of a prompt. Only adjacent ordinary prompts combine.
      const isCommand = isSlashCommand(messageQueue[0]);
      if (!isCommand && !isMcpReady) return;
      let count = 1;
      if (!isCommand) {
        while (
          count < messageQueue.length &&
          !isSlashCommand(messageQueue[count])
        )
          count++;
      }
      const query = messageQueue.slice(0, count).join('\n\n');
      submissionInFlight.current = true;
      setIsSubmitting(true);
      setMessageQueue((pending) => pending.slice(count));
      void Promise.resolve()
        .then(() => (mounted.current ? submitQuery(query) : undefined))
        .catch((error: unknown) => {
          if (mounted.current)
            coreEvents.emitFeedback(
              'error',
              I18nManager.getInstance().t(
                '排队输入执行失败，请检查错误后重试。其余输入将继续按顺序处理。',
                'A queued input failed. Check the error before retrying; remaining inputs will continue in order.',
              ),
              error,
            );
        })
        .finally(() => {
          submissionInFlight.current = false;
          if (mounted.current) setIsSubmitting(false);
        });
    }
  }, [
    isConfigInitialized,
    areCommandsReady,
    isSubmitting,
    streamingState,
    isMcpReady,
    messageQueue,
    submitQuery,
    isCompressing,
  ]);

  return {
    messageQueue,
    addMessage,
    clearQueue,
    getQueuedMessagesText,
    popAllMessages,
  };
}
