/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager } from '../i18n/i18nManager.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { getErrorStatus } from '../utils/httpErrors.js';
import { isRetryableError } from '../utils/retry.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import { ProviderManager } from './providerManager.js';
import type { ProviderProtocol } from './providerTypes.js';

interface Entry {
  protocol: ProviderProtocol;
  stream: boolean;
  status: number;
}
const entries: Entry[] = [
  { protocol: 'openai-chat', stream: false, status: 429 },
  { protocol: 'openai-chat', stream: true, status: 503 },
  { protocol: 'openai-responses', stream: true, status: 400 },
  { protocol: 'anthropic', stream: true, status: 429 },
  { protocol: 'gemini', stream: false, status: 503 },
  { protocol: 'gemini', stream: true, status: 400 },
];
const jsonEntries = entries.filter((entry) => !entry.stream);
let root: string;
let generator: UniversalContentGenerator;
beforeEach(() => {
  vi.useFakeTimers();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-body-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  vi.stubEnv('GEMINI_ULTRA_STREAM_IDLE_MS', '1000');
  I18nManager.getInstance().setLocale('en');
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    models: ['fixture'],
  });
  generator = new UniversalContentGenerator({
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
async function consume(
  entry: Entry,
  signal?: AbortSignal,
): Promise<{ calls: number; text?: string; error?: unknown }> {
  const manager = ProviderManager.getInstance();
  manager.upsertProvider({
    ...manager.getActiveProvider()!,
    protocol: entry.protocol,
  });
  const input = {
    model: 'fixture',
    contents: 'Fixture',
    config: { abortSignal: signal },
  };
  let calls = 0;
  try {
    if (entry.stream) {
      for await (const chunk of await generator.generateContentStream(
        input,
        'fixture',
        LlmRole.UTILITY_TOOL,
      ))
        calls += chunk.functionCalls?.length ?? 0;
      return { calls, text: '' };
    }
    const response = await generator.generateContent(
      input,
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    return { calls: response.functionCalls?.length ?? 0, text: response.text };
  } catch (error) {
    return { calls, error };
  }
}
function stalledBody(status: number, trickle = false) {
  let timer: ReturnType<typeof setTimeout>;
  let interval: ReturnType<typeof setInterval>;
  const cancel = vi.fn(() => {
    clearTimeout(timer);
    clearInterval(interval);
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('PRIVATE_PARTIAL_BODY'));
      if (trickle)
        interval = setInterval(
          () => controller.enqueue(new Uint8Array([32])),
          100,
        );
      timer = setTimeout(() => {
        clearInterval(interval);
        controller.close();
      }, 5000);
    },
    cancel,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
  return cancel;
}
it.each(entries)(
  'bounds HTTP $status body for $protocol stream=$stream and retains classification',
  async (entry) => {
    const cancel = stalledBody(entry.status, true);
    let ended = false;
    const outcome = consume(entry).then((result) => {
      ended = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(1100);
    const endedWithinDeadline = ended;
    await vi.advanceTimersByTimeAsync(5100);
    const result = await outcome;
    expect(endedWithinDeadline).toBe(true);
    expect(getErrorStatus(result.error)).toBe(entry.status);
    expect(isRetryableError(result.error)).toBe(entry.status !== 400);
    expect(String(result.error)).not.toContain('PRIVATE_PARTIAL_BODY');
    expect(result.calls).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  },
);
it.each(jsonEntries)(
  'bounds stalled successful JSON body for $protocol without publishing a response',
  async (entry) => {
    const cancel = stalledBody(200);
    let ended = false;
    const outcome = consume(entry).then((result) => {
      ended = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(1100);
    const endedWithinDeadline = ended;
    await vi.advanceTimersByTimeAsync(5100);
    const result = await outcome;
    expect(endedWithinDeadline).toBe(true);
    expect(String(result.error)).toContain('response body');
    expect(result.calls).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it.each(jsonEntries)(
  'bounds nonstream response headers for $protocol',
  async (entry) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(new Response('')), 5000);
          }),
      ),
    );
    let ended = false;
    const outcome = consume(entry).then((result) => {
      ended = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(1100);
    const endedWithinDeadline = ended;
    await vi.advanceTimersByTimeAsync(5100);
    expect(endedWithinDeadline).toBe(true);
    expect(String((await outcome).error)).toContain(
      'HTTP response headers within 1000 ms',
    );
  },
);
it.each([200, 503])(
  'preserves caller cancellation while reading HTTP %s body',
  async (status) => {
    const cancel = stalledBody(status);
    const caller = new AbortController();
    const reason = new DOMException('User stopped reading', 'AbortError');
    let ended = false;
    const outcome = consume(entries[0], caller.signal).then((result) => {
      ended = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(100);
    caller.abort(reason);
    await vi.advanceTimersByTimeAsync(10);
    const endedAtCancellation = ended;
    await vi.advanceTimersByTimeAsync(6100);
    expect(endedAtCancellation).toBe(true);
    expect((await outcome).error).toBe(reason);
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it.each(jsonEntries)(
  'keeps progressing long JSON and split UTF8 intact for $protocol',
  async (entry) => {
    const text = 'Valid 票据🧪';
    const value =
      entry.protocol === 'gemini'
        ? {
            candidates: [
              {
                content: { role: 'model', parts: [{ text }] },
                finishReason: 'STOP',
              },
            ],
          }
        : { choices: [{ message: { content: text }, finish_reason: 'stop' }] };
    const bytes = new TextEncoder().encode('\uFEFF' + JSON.stringify(value));
    const middle = bytes.indexOf(0xf0) + 2;
    const pieces = [
      bytes.slice(0, 5),
      bytes.slice(5, middle),
      bytes.slice(middle),
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        pieces.forEach((piece, index) =>
          setTimeout(() => controller.enqueue(piece), 100 + index * 600),
        );
        setTimeout(() => controller.close(), 1900);
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const outcome = consume(entry);
    await vi.advanceTimersByTimeAsync(2100);
    const result = await outcome;
    expect(result.error).toBeUndefined();
    expect(result.text).toBe(text);
    expect(fetch).toHaveBeenCalledOnce();
  },
);
