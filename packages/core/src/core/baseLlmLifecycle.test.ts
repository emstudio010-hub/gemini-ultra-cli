/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeFakeConfig } from '../test-utils/config.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { BaseLlmClient } from './baseLlmClient.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { reportError } from '../utils/errorReporting.js';
vi.mock('../utils/errorReporting.js');
let config: Config;
let generator: ContentGenerator;
let client: BaseLlmClient;
const response = Object.assign(new GenerateContentResponse(), {
  candidates: [
    { content: { role: 'model', parts: [{ text: '{"kept":true}' }] } },
  ],
});
const operations = ['content', 'json', 'tokens', 'embedding'] as const;
type Operation = (typeof operations)[number];
beforeEach(() => {
  vi.clearAllMocks();
  config = makeFakeConfig();
  generator = {
    generateContent: vi.fn().mockResolvedValue(response),
    generateContentStream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 17 }),
    embedContent: vi
      .fn()
      .mockResolvedValue({ embeddings: [{ values: [1, 2] }] }),
  };
  client = new BaseLlmClient(generator, config);
});
afterEach(async () => {
  await config.dispose();
  vi.restoreAllMocks();
});
function invoke(operation: Operation, signal = new AbortController().signal) {
  const options = {
    modelConfigKey: { model: 'fixture' },
    contents: [{ role: 'user', parts: [{ text: 'Utility fixture' }] }],
    abortSignal: signal,
    promptId: 'fixture',
    role: LlmRole.UTILITY_TOOL,
    maxAttempts: 1,
  };
  switch (operation) {
    case 'content':
      return client.generateContent(options);
    case 'json':
      return client.generateJson({
        ...options,
        schema: { type: 'object', properties: { kept: { type: 'boolean' } } },
      });
    case 'tokens':
      return client.countTokens({ contents: options.contents });
    case 'embedding':
      return client.generateEmbedding(['fixture']);
    default:
      throw new Error('Unknown utility operation');
  }
}
it.each(operations)(
  'cancels pending %s on Config disposal and ignores a non-cooperative late result',
  async (operation) => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = <T>(value: T) =>
      new Promise<T>((resolve) => {
        release = () => resolve(value);
        entered();
      });
    if (operation === 'tokens')
      vi.mocked(generator.countTokens).mockImplementationOnce(() =>
        hold({ totalTokens: 17 }),
      );
    else if (operation === 'embedding')
      vi.mocked(generator.embedContent).mockImplementationOnce(() =>
        hold({ embeddings: [{ values: [1, 2] }] }),
      );
    else
      vi.mocked(generator.generateContent).mockImplementationOnce(() =>
        hold(response),
      );
    const caller = new AbortController();
    let error: unknown;
    const pending = invoke(operation, caller.signal).catch((failure) => {
      error = failure;
    });
    try {
      await started;
      await config.dispose();
      await vi.waitFor(
        () =>
          expect(error).toMatchObject({
            name: 'AbortError',
            message: 'Configuration disposed.',
          }),
        { timeout: 200 },
      );
      expect(caller.signal.aborted).toBe(false);
      const request =
        operation === 'tokens'
          ? vi.mocked(generator.countTokens).mock.calls[0][0]
          : operation === 'embedding'
            ? vi.mocked(generator.embedContent).mock.calls[0][0]
            : vi.mocked(generator.generateContent).mock.calls[0][0];
      expect(request.config?.abortSignal?.aborted).toBe(true);
    } finally {
      release?.();
      await pending;
    }
    expect(reportError).not.toHaveBeenCalled();
    expect(generator.generateContent).toHaveBeenCalledTimes(
      operation === 'content' || operation === 'json' ? 1 : 0,
    );
  },
);
it.each(operations)(
  'rejects %s after Config disposal without dispatch',
  async (operation) => {
    await config.dispose();
    await expect(invoke(operation)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Configuration disposed.',
    });
    expect(generator.generateContent).not.toHaveBeenCalled();
    expect(generator.countTokens).not.toHaveBeenCalled();
    expect(generator.embedContent).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  },
);
it('keeps an explicit caller cancellation separate from the Config lifecycle', async () => {
  const caller = new AbortController();
  const reason = new DOMException(
    'Explicit utility cancellation',
    'AbortError',
  );
  caller.abort(reason);
  await expect(invoke('content', caller.signal)).rejects.toBe(reason);
  expect(config.getLifecycleSignal().aborted).toBe(false);
  expect(generator.generateContent).not.toHaveBeenCalled();
  await expect(invoke('json')).resolves.toEqual({ kept: true });
});
