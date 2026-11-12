/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProviderManager } from './providerManager.js';

let root: string;
let manager: ProviderManager;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-catalog-'));
  manager = new ProviderManager(path.join(root, 'providers.json'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});
const input = {
  baseUrl: 'https://fixture.invalid/v1',
  apiKey: 'FAKE_CATALOG_KEY',
  timeoutMs: 500,
};

it('rejects an oversized declared catalog before reading and cancels its body', async () => {
  let timer: ReturnType<typeof setTimeout>;
  const cancel = vi.fn(() => clearTimeout(timer));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":[]}'));
            timer = setTimeout(() => controller.close(), 30);
          },
          cancel,
        }),
        { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } },
      ),
    ),
  );
  expect(await manager.fetchModelsFromEndpoint(input)).toMatchObject({
    models: [],
    error: expect.stringContaining('2 MiB'),
  });
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('bounds streamed catalog bytes even when content-length is missing or too small', async () => {
  for (const headers of [
    new Headers(),
    new Headers({ 'content-length': '2' }),
  ]) {
    const cancel = vi.fn();
    let chunks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            pull(controller) {
              if (chunks++ < 3) controller.enqueue(new Uint8Array(1024 * 1024));
              else controller.close();
            },
            cancel,
          }),
          { headers },
        ),
      ),
    );
    const result = await manager.fetchModelsFromEndpoint(input);
    expect(result.models).toEqual([]);
    expect(result.error).toContain('2 MiB');
    // A finite stream may already have closed its prefetched final chunk;
    // cancelling that closed stream does not invoke the underlying hook.
    expect(chunks).toBeLessThanOrEqual(4);
  }
});

it.each(['timeout', 'cancel'] as const)(
  'settles a stalled response body on %s even if the response stream ignores the fetch signal',
  async (mode) => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))),
    );
    const controller = new AbortController();
    const result = manager.fetchModelsFromEndpoint({
      ...input,
      timeoutMs: mode === 'timeout' ? 30 : 500,
      signal: controller.signal,
    });
    if (mode === 'cancel') controller.abort();
    await expect(
      Promise.race([
        result,
        new Promise((resolve) =>
          setTimeout(() => resolve({ error: 'OBSERVATION_DEADLINE' }), 200),
        ),
      ]),
    ).resolves.toMatchObject({
      models: [],
      error:
        mode === 'timeout'
          ? 'Model discovery timed out.'
          : 'Model discovery cancelled.',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  },
);

it('does not dispatch an already cancelled model discovery', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"data":[]}'));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  controller.abort();
  expect(
    await manager.fetchModelsFromEndpoint({
      ...input,
      signal: controller.signal,
    }),
  ).toMatchObject({ models: [], error: 'Model discovery cancelled.' });
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves chunked UTF-8 model catalogs, normalization, ordering and caller configuration', async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      models: [
        'models/中文模型',
        { name: 'models/other' },
        { id: 'other' },
        ' custom ',
      ],
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
      ),
    ),
  );
  expect(await manager.fetchModelsFromEndpoint(input)).toEqual({
    models: ['中文模型', 'other', 'custom'],
  });
  expect(fs.existsSync(path.join(root, 'providers.json'))).toBe(false);
});
