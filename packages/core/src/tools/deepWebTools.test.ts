/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { deepWebFetch, DeepWebFetchTool } from './deepWebTools.js';

afterEach(() => vi.unstubAllGlobals());
const html =
  '<title>Root</title><p>Retained root evidence</p><a href="/slow">child</a><a href="/later">later</a>';

it('honors a pre-cancelled public tool before fetch', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('unused'));
  vi.stubGlobal('fetch', fetch);
  const reason = new DOMException('Cancelled before deep fetch', 'AbortError');
  const invocation = new DeepWebFetchTool({} as Config, {} as MessageBus).build(
    { url: 'https://fixture.invalid/' },
  );
  await expect(
    invocation.execute({ abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});

it('shares the whole-crawl deadline with subpages and retains the root on timeout', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
    if (fetch.mock.calls.length === 1)
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    if (!init?.signal) return new Response('Old unsignalled child');
    const signal = init.signal;
    return new Promise<Response>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  const result = await deepWebFetch({
    url: 'https://fixture.invalid/',
    depth: 2,
    timeoutMs: 25,
  });
  expect(result.error).toMatch(/timed out/i);
  expect(result.content).toContain('Retained root evidence');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([true, false])(
  'rejects a response over 2 MiB and cancels the body (declared=%s)',
  async (declared) => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        },
        cancel,
      }),
      {
        headers: declared
          ? { 'content-length': String(2 * 1024 * 1024 + 1) }
          : {},
      },
    );
    // Permit the old implementation to complete instead of hanging on res.text().
    const legacyText = vi
      .spyOn(response, 'text')
      .mockResolvedValue('unbounded legacy text');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const result = await deepWebFetch({ url: 'https://fixture.invalid/' });
    expect(result.error).toMatch(/2 MiB/i);
    expect(legacyText).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  },
);

it('propagates cancellation during a subpage and does not start later links', async () => {
  const controller = new AbortController();
  const reason = new DOMException('Cancelled child', 'AbortError');
  const fetch = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
    if (fetch.mock.calls.length === 1)
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    controller.abort(reason);
    if (init?.signal?.aborted) throw init.signal.reason;
    return new Response('Old child result');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(
    deepWebFetch(
      { url: 'https://fixture.invalid/', depth: 2 },
      controller.signal,
    ),
  ).rejects.toBe(reason);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps child failures visible and crawls matching origins with relative links', async () => {
  const fetch = vi.fn().mockImplementation(async (url) => {
    if (String(url).endsWith('/docs/'))
      return new Response(
        '<title>Docs</title><pre>const evidence = 42;</pre><a href="http://fixture.invalid/other">scheme</a><a href="https://fixture.invalid:444/other">port</a><a href="child">relative</a><a href="/bad">failure</a>',
        { headers: { 'content-type': 'text/html' } },
      );
    if (String(url).endsWith('/bad')) return new Response('', { status: 503 });
    return new Response('<title>Child</title>你好 evidence');
  });
  vi.stubGlobal('fetch', fetch);
  const result = await deepWebFetch({
    url: 'https://fixture.invalid/docs/',
    depth: 2,
  });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://fixture.invalid/docs/',
    'https://fixture.invalid/docs/child',
    'https://fixture.invalid/bad',
  ]);
  expect(result.subPages?.[0].content).toContain('你好 evidence');
  expect(JSON.stringify(result)).toContain('HTTP 503');
  expect(result.codeBlocks).toContain('const evidence = 42;');
});
