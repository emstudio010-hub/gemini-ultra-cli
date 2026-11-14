/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';

let config: Config;
let fallback: ContentGenerator;
let generator: UniversalContentGenerator;
const response = Object.assign(new GenerateContentResponse(), {
  candidates: [{ content: { role: 'model', parts: [{ text: 'healthy' }] } }],
});
const request = { model: 'gemini-fixture', contents: 'isolated fixture' };
type Operation = 'content' | 'stream' | 'tokens' | 'embedding';
const operations: Operation[] = ['content', 'stream', 'tokens', 'embedding'];
beforeEach(() => {
  config = makeFakeConfig();
  vi.spyOn(ProviderManager, 'getInstance').mockReturnValue({
    resolveProviderForModel: () => null,
    getActiveProvider: () => undefined,
    getActiveModel: () => undefined,
  } as unknown as ProviderManager);
  fallback = {
    generateContent: vi.fn().mockResolvedValue(response),
    generateContentStream: vi.fn().mockImplementation(async () =>
      (async function* () {
        yield response;
      })(),
    ),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 7 }),
    embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [1] }] }),
  };
  generator = new UniversalContentGenerator(fallback, config);
});
afterEach(async () => {
  await config.dispose();
  vi.restoreAllMocks();
});
function invoke(operation: Operation, signal?: AbortSignal) {
  const input = { ...request, config: signal ? { abortSignal: signal } : {} };
  switch (operation) {
    case 'content':
      return generator.generateContent(input, 'fixture', LlmRole.UTILITY_TOOL);
    case 'stream':
      return generator.generateContentStream(
        input,
        'fixture',
        LlmRole.UTILITY_TOOL,
      );
    case 'tokens':
      return generator.countTokens(input);
    case 'embedding':
      return generator.embedContent(input);
    default:
      throw new Error('Unknown direct generator operation');
  }
}
it.each(operations)(
  'cancels direct pending %s without accepting a late value or dispatching again',
  async (operation) => {
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const held = <T>(value: T) =>
      new Promise<T>((resolve) => {
        release = () => resolve(value);
        entered();
      });
    const lateStream = (async function* () {
      yield response;
    })();
    const returned = vi.spyOn(lateStream, 'return');
    if (operation === 'content')
      vi.mocked(fallback.generateContent).mockImplementationOnce(() =>
        held(response),
      );
    if (operation === 'stream')
      vi.mocked(fallback.generateContentStream).mockImplementationOnce(() =>
        held(lateStream),
      );
    if (operation === 'tokens')
      vi.mocked(fallback.countTokens).mockImplementationOnce(() =>
        held({ totalTokens: 7 }),
      );
    if (operation === 'embedding')
      vi.mocked(fallback.embedContent).mockImplementationOnce(() =>
        held({ embeddings: [{ values: [1] }] }),
      );
    const caller = new AbortController();
    let error: unknown;
    const pending = invoke(operation, caller.signal).catch((failure) => {
      error = failure;
    });
    await started;
    try {
      await config.dispose();
      await vi.waitFor(
        () => expect(error).toBe(config.getLifecycleSignal().reason),
        { timeout: 200 },
      );
      expect(caller.signal.aborted).toBe(false);
    } finally {
      release();
      await pending;
    }
    if (operation === 'stream')
      await vi.waitFor(() => expect(returned).toHaveBeenCalledTimes(1));
    const fn =
      operation === 'content'
        ? fallback.generateContent
        : operation === 'stream'
          ? fallback.generateContentStream
          : operation === 'tokens'
            ? fallback.countTokens
            : fallback.embedContent;
    expect(vi.mocked(fn).mock.calls[0][0].config?.abortSignal?.aborted).toBe(
      true,
    );
    await expect(invoke(operation)).rejects.toBe(
      config.getLifecycleSignal().reason,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  },
);
it('cancels a pending native stream read without publishing the late chunk and closes once', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const source = (async function* () {
    await new Promise<void>((resolve) => {
      release = resolve;
      entered();
    });
    yield response;
  })();
  const returned = vi.spyOn(source, 'return');
  vi.mocked(fallback.generateContentStream).mockResolvedValueOnce(source);
  const stream = await generator.generateContentStream(
    request,
    'fixture',
    LlmRole.UTILITY_TOOL,
  );
  let error: unknown;
  const read = stream.next().catch((failure) => {
    error = failure;
  });
  await started;
  try {
    await config.dispose();
    await vi.waitFor(
      () => expect(error).toBe(config.getLifecycleSignal().reason),
      { timeout: 200 },
    );
  } finally {
    release();
    await read;
  }
  await expect(stream.next()).rejects.toBe(config.getLifecycleSignal().reason);
  expect(returned).toHaveBeenCalledTimes(1);
});
it('closes an opened stream on disposal even when never read', async () => {
  const source = (async function* () {
    yield response;
  })();
  const returned = vi.spyOn(source, 'return');
  vi.mocked(fallback.generateContentStream).mockResolvedValueOnce(source);
  await generator.generateContentStream(
    request,
    'fixture',
    LlmRole.UTILITY_TOOL,
  );
  await config.dispose();
  await vi.waitFor(() => expect(returned).toHaveBeenCalledTimes(1));
});
it('preserves caller cancellation instead of estimating a successful count and keeps the session usable', async () => {
  const caller = new AbortController();
  const reason = new DOMException('Caller stopped token count', 'AbortError');
  vi.mocked(fallback.countTokens).mockImplementationOnce(async () => {
    caller.abort(reason);
    throw reason;
  });
  await expect(invoke('tokens', caller.signal)).rejects.toBe(reason);
  expect(config.getLifecycleSignal().aborted).toBe(false);
  await expect(invoke('content')).resolves.toBe(response);
  await expect(invoke('tokens')).resolves.toEqual({ totalTokens: 7 });
});
it('keeps normal stream iteration and early return usable before any read', async () => {
  const source = (async function* () {
    yield response;
  })();
  const returned = vi.spyOn(source, 'return');
  vi.mocked(fallback.generateContentStream).mockResolvedValueOnce(source);
  const early = await generator.generateContentStream(
    request,
    'fixture',
    LlmRole.UTILITY_TOOL,
  );
  await early.return(undefined);
  expect(returned).toHaveBeenCalledTimes(1);
  const normal = await generator.generateContentStream(
    request,
    'fixture',
    LlmRole.UTILITY_TOOL,
  );
  await expect(normal.next()).resolves.toEqual({
    value: response,
    done: false,
  });
  await expect(normal.next()).resolves.toEqual({
    value: undefined,
    done: true,
  });
  vi.mocked(fallback.countTokens).mockRejectedValueOnce(
    new Error('ordinary count failure'),
  );
  await expect(invoke('tokens')).resolves.toEqual({
    totalTokens: Math.ceil(JSON.stringify(request.contents).length / 3),
  });
  expect(config.getLifecycleSignal().aborted).toBe(false);
});
