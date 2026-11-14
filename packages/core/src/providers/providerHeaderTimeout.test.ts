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
import { UniversalContentGenerator } from './universalContentGenerator.js';
import { ProviderManager } from './providerManager.js';
import type { ProviderProtocol } from './providerTypes.js';

let root: string;
let generator: UniversalContentGenerator;
beforeEach(() => {
  vi.useFakeTimers();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-header-timeout-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  vi.stubEnv('GEMINI_ULTRA_STREAM_IDLE_MS', '1000');
  I18nManager.getInstance().setLocale('en');
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    protocol: 'openai-chat',
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
function delayedHeaders() {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(new Response(body)), 5000);
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return { cancel, body, fetchMock };
}
async function consume(signal?: AbortSignal) {
  try {
    for await (const chunk of await generator.generateContentStream(
      {
        model: 'fixture',
        contents: 'Fixture',
        config: { abortSignal: signal },
      },
      'headers',
      LlmRole.UTILITY_TOOL,
    ))
      void chunk;
    return undefined;
  } catch (error) {
    return error;
  }
}
it.each<ProviderProtocol>([
  'openai-chat',
  'openai-responses',
  'anthropic',
  'gemini',
])(
  'bounds %s response headers and cancels a late response from a non-cooperative fetch',
  async (protocol) => {
    const manager = ProviderManager.getInstance();
    manager.upsertProvider({ ...manager.getActiveProvider()!, protocol });
    const { cancel, body, fetchMock } = delayedHeaders();
    let ended = false;
    const outcome = consume().then((error) => {
      ended = true;
      return error;
    });
    await vi.advanceTimersByTimeAsync(1100);
    const endedWithinDeadline = ended;
    await vi.advanceTimersByTimeAsync(5100);
    const error = await outcome;
    expect(endedWithinDeadline).toBe(true);
    expect(String(error)).toContain('HTTP response headers within 1000 ms');
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it('retains caller cancellation while waiting for headers and cleans the late body', async () => {
  const { cancel, fetchMock } = delayedHeaders();
  const caller = new AbortController();
  const reason = new DOMException('Caller stopped waiting', 'AbortError');
  let ended = false;
  const outcome = consume(caller.signal).then((error) => {
    ended = true;
    return error;
  });
  await vi.advanceTimersByTimeAsync(100);
  caller.abort(reason);
  await vi.advanceTimersByTimeAsync(10);
  const endedAtCancellation = ended;
  await vi.advanceTimersByTimeAsync(6100);
  expect(endedAtCancellation).toBe(true);
  expect(await outcome).toBe(reason);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
});
