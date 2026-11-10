/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';

describe('Provider stream completion and recovery', () => {
  let directory: string;
  let generator: UniversalContentGenerator;
  const encoder = new TextEncoder();
  const frame = (value: unknown) =>
    encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  const request = { model: 'stream-fixture', contents: 'Read the fixture' };
  const fallback: ContentGenerator = {
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    directory = mkdtempSync(path.join(os.tmpdir(), 'ultra-stream-'));
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(directory, 'providers.json'),
    );
    vi.stubEnv('GEMINI_ULTRA_STREAM_IDLE_MS', '10000');
    ProviderManager.resetInstance();
    ProviderManager.getInstance().upsertProvider({
      name: 'Local stream fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
      protocol: 'openai-chat',
      models: ['stream-fixture'],
      defaultModel: 'stream-fixture',
    });
    generator = new UniversalContentGenerator(fallback);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    ProviderManager.resetInstance();
    rmSync(directory, { recursive: true, force: true });
  });

  it('finishes within the fixed tail deadline despite keepalives and retains trailing usage', async () => {
    let heartbeat: ReturnType<typeof setInterval>;
    let usage: ReturnType<typeof setTimeout>;
    let close: ReturnType<typeof setTimeout>;
    const cancel = vi.fn(() => {
      clearInterval(heartbeat);
      clearTimeout(usage);
      clearTimeout(close);
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          frame({
            choices: [{ delta: { content: 'Ready' }, finish_reason: 'stop' }],
          }),
        );
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(': keepalive\n\n')),
          100,
        );
        usage = setTimeout(
          () =>
            controller.enqueue(
              frame({
                choices: [],
                usage: {
                  prompt_tokens: 12,
                  completion_tokens: 3,
                  total_tokens: 15,
                },
              }),
            ),
          500,
        );
        close = setTimeout(() => {
          clearInterval(heartbeat);
          controller.close();
        }, 6000);
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const stream = await generator.generateContentStream(
      request,
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    let ended = false;
    const chunks: GenerateContentResponse[] = [];
    const consume = (async () => {
      for await (const chunk of stream) chunks.push(chunk);
      ended = true;
    })();
    await vi.advanceTimersByTimeAsync(2500);
    const endedWithinDeadline = ended;
    await vi.advanceTimersByTimeAsync(4000);
    await consume;
    expect(endedWithinDeadline).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks.at(-1)?.usageMetadata?.totalTokenCount).toBe(15);
    expect(
      chunks
        .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
        .some((part) => part.text === 'Ready'),
    ).toBe(true);
  });

  it('rejects incomplete streams and can complete the following request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(frame({ choices: [{ delta: { content: 'Partial' } }] })),
        )
        .mockResolvedValueOnce(
          new Response(
            frame({
              choices: [
                { delta: { content: 'Recovered' }, finish_reason: 'stop' },
              ],
            }),
          ),
        ),
    );
    const incomplete = await generator.generateContentStream(
      request,
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    await expect(
      (async () => {
        for await (const chunk of incomplete) void chunk;
      })(),
    ).rejects.toThrow('before completion');
    const recovered = await generator.generateContentStream(
      request,
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    const text: string[] = [];
    for await (const chunk of recovered)
      for (const part of chunk.candidates?.[0]?.content?.parts ?? [])
        if (part.text) text.push(part.text);
    expect(text.join('')).toBe('Recovered');
  });
});
