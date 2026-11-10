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

  it.each(
    (['openai-chat', 'openai-responses', 'anthropic'] as const).flatMap(
      (protocol) => [
        { protocol, tool: false },
        { protocol, tool: true },
      ],
    ),
  )(
    'emits one terminal marker after thoughts, text and tools: $protocol / tool=$tool',
    async ({ protocol, tool }) => {
      const manager = ProviderManager.getInstance();
      const provider = manager.getActiveProvider();
      if (!provider) throw new Error('Missing fixture provider');
      manager.upsertProvider({ ...provider, protocol });
      let events: unknown[];
      if (protocol === 'openai-chat') {
        const delta = (value: unknown) => ({ choices: [{ delta: value }] });
        events = [
          delta({ reasoning_content: 'Thinking...' }),
          delta({ content: 'Before ' }),
          delta({ content: 'answer.' }),
          ...(tool
            ? [
                delta({
                  tool_calls: [
                    {
                      index: 0,
                      id: 'c1',
                      function: { name: 'read_file', arguments: '{"path":' },
                    },
                  ],
                }),
                delta({
                  tool_calls: [{ index: 0, function: { arguments: '"x"}' } }],
                }),
              ]
            : []),
          {
            choices: [
              { delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' },
            ],
          },
          {
            choices: [],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 3,
              total_tokens: 15,
            },
          },
        ];
      } else if (protocol === 'openai-responses') {
        events = [
          {
            type: 'response.reasoning_summary_text.delta',
            delta: 'Thinking...',
          },
          { type: 'response.output_text.delta', delta: 'Before ' },
          { type: 'response.output_text.delta', delta: 'answer.' },
          ...(tool
            ? [
                {
                  type: 'response.output_item.added',
                  item: {
                    type: 'function_call',
                    id: 'item1',
                    call_id: 'c1',
                    name: 'read_file',
                  },
                },
                {
                  type: 'response.function_call_arguments.delta',
                  item_id: 'item1',
                  delta: '{"path":',
                },
                {
                  type: 'response.function_call_arguments.delta',
                  item_id: 'item1',
                  delta: '"x"}',
                },
              ]
            : []),
          {
            type: 'response.completed',
            response: { usage: { input_tokens: 12, output_tokens: 3 } },
          },
        ];
      } else {
        events = [
          {
            type: 'message_start',
            message: { usage: { input_tokens: 12, output_tokens: 0 } },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'Thinking...' },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'Before ' },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'answer.' },
          },
          ...(tool
            ? [
                {
                  type: 'content_block_start',
                  index: 2,
                  content_block: {
                    type: 'tool_use',
                    id: 'c1',
                    name: 'read_file',
                    input: {},
                  },
                },
                {
                  type: 'content_block_delta',
                  index: 2,
                  delta: { type: 'input_json_delta', partial_json: '{"path":' },
                },
                {
                  type: 'content_block_delta',
                  index: 2,
                  delta: { type: 'input_json_delta', partial_json: '"x"}' },
                },
              ]
            : []),
          {
            type: 'message_delta',
            delta: { stop_reason: tool ? 'tool_use' : 'end_turn' },
            usage: { output_tokens: 3 },
          },
          { type: 'message_stop' },
        ];
      }
      const body = events
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join('');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
      const chunks: GenerateContentResponse[] = [];
      const stream = await generator.generateContentStream(
        request,
        'fixture',
        LlmRole.UTILITY_TOOL,
      );
      for await (const chunk of stream) chunks.push(chunk);
      expect(
        chunks
          .slice(0, -1)
          .flatMap((chunk) => chunk.candidates ?? [])
          .every((candidate) => !candidate.finishReason),
      ).toBe(true);
      expect(chunks.at(-1)?.candidates?.[0]?.finishReason).toBe('STOP');
      expect(
        chunks
          .flatMap((chunk) => chunk.candidates ?? [])
          .filter((candidate) => candidate.finishReason),
      ).toHaveLength(1);
      expect(chunks.at(-1)?.usageMetadata?.totalTokenCount).toBe(15);
      const parts = chunks.flatMap(
        (chunk) => chunk.candidates?.[0]?.content?.parts ?? [],
      );
      expect(
        parts
          .filter((part) => part.thought)
          .map((part) => part.text)
          .join(''),
      ).toBe('Thinking...');
      expect(
        parts
          .filter((part) => !part.thought && part.text)
          .map((part) => part.text)
          .join(''),
      ).toBe('Before answer.');
      expect(
        parts
          .filter((part) => part.functionCall)
          .map((part) => part.functionCall),
      ).toEqual(
        tool ? [{ id: 'c1', name: 'read_file', args: { path: 'x' } }] : [],
      );
    },
  );

  it.each([false, true])(
    'times out heartbeats without complete data events (initialData=%s)',
    async (initialData) => {
      vi.stubEnv('GEMINI_ULTRA_STREAM_IDLE_MS', '1000');
      let heartbeat: ReturnType<typeof setInterval>;
      let close: ReturnType<typeof setTimeout>;
      const cancel = vi.fn(() => {
        clearInterval(heartbeat);
        clearTimeout(close);
      });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (initialData)
            controller.enqueue(
              frame({
                choices: [{ delta: { reasoning_content: 'Thinking' } }],
              }),
            );
          heartbeat = setInterval(
            () =>
              controller.enqueue(
                encoder.encode(
                  initialData
                    ? 'event: ping\ndata: {"type":"ping"}\n\n'
                    : ': keepalive\n\n',
                ),
              ),
            100,
          );
          close = setTimeout(() => {
            clearInterval(heartbeat);
            controller.close();
          }, 5000);
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
      let error: unknown;
      const consume = (async () => {
        try {
          for await (const chunk of stream) void chunk;
        } catch (failure) {
          error = failure;
        } finally {
          ended = true;
        }
      })();
      await vi.advanceTimersByTimeAsync(1100);
      const endedWithinDeadline = ended;
      await vi.advanceTimersByTimeAsync(5000);
      await consume;
      expect(endedWithinDeadline).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('idle for 1000 ms');
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('refreshes the progress deadline for complete data events during a long stream', async () => {
    vi.stubEnv('GEMINI_ULTRA_STREAM_IDLE_MS', '1000');
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const [index, content] of ['One ', 'two ', 'three'].entries()) {
          timers.push(
            setTimeout(
              () =>
                controller.enqueue(
                  frame({ choices: [{ delta: { content } }] }),
                ),
              600 * (index + 1),
            ),
          );
        }
        timers.push(
          setTimeout(() => {
            controller.enqueue(
              frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
            );
            controller.close();
          }, 2400),
        );
      },
      cancel() {
        timers.forEach(clearTimeout);
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const stream = await generator.generateContentStream(
      request,
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    const chunks: GenerateContentResponse[] = [];
    let error: unknown;
    const consume = (async () => {
      try {
        for await (const chunk of stream) chunks.push(chunk);
      } catch (failure) {
        error = failure;
      }
    })();
    await vi.advanceTimersByTimeAsync(2500);
    await consume;
    expect(error).toBeUndefined();
    expect(
      chunks
        .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join(''),
    ).toBe('One two three');
    expect(chunks.at(-1)?.candidates?.[0]?.finishReason).toBe('STOP');
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
