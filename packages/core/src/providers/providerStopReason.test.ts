/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { ProviderProtocol } from './providerTypes.js';
import { LlmRole } from '../telemetry/llmRole.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-stop-reason-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const cases: Array<{
  protocol: ProviderProtocol;
  reason: string;
  stream: boolean;
}> = [
  { protocol: 'openai-chat', reason: 'content_filter', stream: true },
  { protocol: 'openai-chat', reason: 'vendor_unknown', stream: true },
  { protocol: 'openai-chat', reason: 'content_filter', stream: false },
  { protocol: 'openai-responses', reason: 'incomplete', stream: true },
  { protocol: 'openai-responses', reason: 'error', stream: true },
  { protocol: 'anthropic', reason: 'refusal', stream: true },
  { protocol: 'anthropic', reason: 'pause_turn', stream: true },
  {
    protocol: 'anthropic',
    reason: 'model_context_window_exceeded',
    stream: true,
  },
  { protocol: 'gemini', reason: 'SAFETY', stream: true },
  { protocol: 'gemini', reason: 'OTHER', stream: false },
];
it.each(cases)(
  'rejects an explicitly abnormal $protocol ending $reason (stream=$stream) before releasing calls',
  async ({ protocol, reason, stream }) => {
    ProviderManager.getInstance().upsertProvider({
      name: 'Fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: 'FAKE_ONLY',
      protocol,
      models: ['stop-fixture'],
    });
    const fallback = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    } satisfies ContentGenerator;
    const generator = new UniversalContentGenerator(fallback);
    const call = {
      id: 'unaccepted',
      name: 'complete_task',
      args: { result: { response: 'NOT_ACCEPTED' } },
    };
    let events: unknown[];
    if (protocol === 'openai-chat') {
      const message = {
        content: 'VISIBLE_DRAFT',
        tool_calls: [
          {
            id: call.id,
            index: 0,
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          },
        ],
      };
      events = [
        {
          choices: [
            { [stream ? 'delta' : 'message']: message, finish_reason: reason },
          ],
        },
      ];
    } else if (protocol === 'openai-responses')
      events = [
        { type: 'response.output_text.delta', delta: 'VISIBLE_DRAFT' },
        {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            id: 'item',
            call_id: call.id,
            name: call.name,
          },
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'item',
          arguments: JSON.stringify(call.args),
        },
        {
          type: 'response.completed',
          response:
            reason === 'error'
              ? { status: 'completed', error: { code: 'fixture_error' } }
              : {
                  status: reason,
                  incomplete_details: { reason: 'max_output_tokens' },
                },
        },
      ];
    else if (protocol === 'anthropic')
      events = [
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'VISIBLE_DRAFT' },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.args,
          },
        },
        { type: 'message_delta', delta: { stop_reason: reason } },
        { type: 'message_stop' },
      ];
    else
      events = [
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'VISIBLE_DRAFT' }, { functionCall: call }],
              },
              finishReason: reason,
            },
          ],
        },
      ];
    const body = stream
      ? events
          .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
          .join('')
      : JSON.stringify(events[0]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const chunks: GenerateContentResponse[] = [];
    const request = { model: 'stop-fixture', contents: 'Fixture' };
    await expect(
      (async () => {
        if (!stream)
          return generator.generateContent(
            request,
            'stop-reason',
            LlmRole.SUBAGENT,
          );
        const response = await generator.generateContentStream(
          request,
          'stop-reason',
          LlmRole.SUBAGENT,
        );
        for await (const chunk of response) chunks.push(chunk);
        return undefined;
      })(),
    ).rejects.toThrow(/incomplete|unsuccessful|abnormal/);
    expect(chunks.flatMap((chunk) => chunk.functionCalls ?? [])).toEqual([]);
    expect(
      chunks
        .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join(''),
    ).toBe(stream ? 'VISIBLE_DRAFT' : '');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fallback.generateContent).not.toHaveBeenCalled();
    expect(fallback.generateContentStream).not.toHaveBeenCalled();
  },
);
