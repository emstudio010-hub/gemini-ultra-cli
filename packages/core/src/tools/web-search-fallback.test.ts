/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import type { GeminiClient } from '../core/client.js';
import { WebSearchTool } from './web-search.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { ToolErrorType } from './tool-error.js';

const html =
  '<div class="result results_links"><h2><a>Fixture title</a></h2><a href="https://example.test/evidence" class="result__url">Example</a><a class="result__snippet">Verified local fixture snippet</a></div>';
let tool: WebSearchTool;
let primary: MockInstance<GeminiClient['generateContent']>;
const fallback = vi.fn<typeof fetch>();
beforeEach(() => {
  const config = makeFakeConfig({ usageStatisticsEnabled: false });
  primary = vi
    .spyOn(config.geminiClient, 'generateContent')
    .mockRejectedValue(new Error('Primary fixture unavailable'));
  tool = new WebSearchTool(config, createMockMessageBus());
  vi.stubGlobal('fetch', fallback);
  fallback.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const invoke = (signal = new AbortController().signal) =>
  tool.build({ query: 'fixture query' }).execute({ abortSignal: signal });

it('reports direct HTTP failures as tool errors instead of successful live results', async () => {
  const cancel = vi.fn();
  fallback.mockResolvedValue(
    new Response(new ReadableStream({ cancel }), { status: 503 }),
  );
  const result = await invoke();
  expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
  expect(result.llmContent).toContain('HTTP 503');
  expect(result.returnDisplay).not.toContain('Live search results');
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('does not start fallback after a cancelled primary request', async () => {
  const controller = new AbortController();
  primary.mockImplementation(async () => {
    controller.abort(new Error('User stopped fixture'));
    throw controller.signal.reason;
  });
  fallback.mockResolvedValue(new Response(html));
  const result = await invoke(controller.signal);
  expect(result.returnDisplay).toBe('Search cancelled.');
  expect(fallback).not.toHaveBeenCalled();
});
it('keeps a successfully parsed direct result and its source', async () => {
  fallback.mockResolvedValue(new Response(html));
  const result = await invoke();
  expect(result.error).toBeUndefined();
  expect(result.sources).toEqual([
    { web: { title: 'Fixture title', uri: 'https://example.test/evidence' } },
  ]);
  expect(result.llmContent).toContain('<untrusted_context>');
  expect(result.llmContent).toContain('Verified local fixture snippet');
});
it('bounds the entire body read by ten seconds and cancels a stalled reader', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  fallback.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html>'));
        },
        cancel,
      }),
    ),
  );
  let settled = false;
  const pending = invoke().then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(10001);
  expect(settled).toBe(true);
  const result = await pending;
  expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
  expect(result.llmContent).toContain('timed out');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects oversized streamed bodies and releases the reader', async () => {
  const cancel = vi.fn();
  fallback.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        },
        cancel,
      }),
    ),
  );
  const result = await invoke();
  expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
  expect(result.llmContent).toContain('size limit');
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('cancels a pending body read immediately with a custom caller reason', async () => {
  const controller = new AbortController();
  const cancel = vi.fn();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  fallback.mockResolvedValue(
    new Response(
      new ReadableStream(
        {
          pull() {
            started();
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    ),
  );
  const pending = invoke(controller.signal);
  await reading;
  controller.abort(new Error('User stopped body fixture'));
  const result = await pending;
  expect(result.returnDisplay).toBe('Search cancelled.');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fallback).toHaveBeenCalledTimes(1);
});

it('distinguishes an explicit empty result page from an unreadable challenge page', async () => {
  fallback.mockResolvedValueOnce(
    new Response('<div class="no-results">No results found</div>'),
  );
  const empty = await invoke();
  expect(empty.error).toBeUndefined();
  expect(empty.sources).toEqual([]);
  expect(empty.llmContent).toContain('No direct search results');
  fallback.mockResolvedValueOnce(
    new Response('<html>PRIVATE_CHALLENGE_BODY</html>'),
  );
  const blocked = await invoke();
  expect(blocked.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
  expect(blocked.llmContent).not.toContain('PRIVATE_CHALLENGE_BODY');
  expect(blocked.returnDisplay).not.toContain('Live search results');
});
