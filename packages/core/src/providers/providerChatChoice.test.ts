/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import { ProviderManager } from './providerManager.js';
import { LlmRole } from '../telemetry/llmRole.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-chat-choice-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    protocol: 'openai-chat',
    models: ['fixture'],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const tc = (args: string) => ({
  index: 0,
  id: 'call',
  function: { name: 'complete_task', arguments: args },
});
async function invoke(events: unknown[], stream = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        stream
          ? events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') +
            'data: [DONE]\n\n'
          : JSON.stringify(events[0]),
        {
          headers: {
            'content-type': stream ? 'text/event-stream' : 'application/json',
          },
        },
      ),
    ),
  );
  const generator = new UniversalContentGenerator({
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  });
  const request = {
    model: 'fixture',
    contents: 'Fixture',
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'complete_task',
              parametersJsonSchema: { type: 'object', properties: {} },
            },
          ],
        },
      ],
    },
  };
  const calls: unknown[] = [];
  const text: string[] = [];
  let error: unknown;
  let totalTokens: number | undefined;
  try {
    const responses = stream
      ? await generator.generateContentStream(
          request,
          'fixture',
          LlmRole.SUBAGENT,
        )
      : [await generator.generateContent(request, 'fixture', LlmRole.SUBAGENT)];
    for await (const response of responses) {
      calls.push(...(response.functionCalls ?? []));
      for (const part of response.candidates?.[0]?.content?.parts ?? [])
        if (part.text) text.push(part.text);
      totalTokens = response.usageMetadata?.totalTokenCount ?? totalTokens;
    }
  } catch (caught) {
    error = caught;
  }
  return { calls, text: text.join(''), error, totalTokens };
}
it.each([false, true])(
  'uses candidate zero instead of the array-first alternative (stream=%s)',
  async (stream) => {
    const primary = {
      index: 0,
      ...(stream
        ? { delta: { tool_calls: [tc('{"result":"primary"}')] } }
        : { message: { tool_calls: [tc('{"result":"primary"}')] } }),
      finish_reason: 'tool_calls',
    };
    const other = {
      index: 1,
      ...(stream
        ? {
            delta: {
              content: 'PRIVATE_ALTERNATIVE',
              tool_calls: [tc('{"result":"alternative"}')],
            },
          }
        : {
            message: {
              content: 'PRIVATE_ALTERNATIVE',
              tool_calls: [tc('{"result":"alternative"}')],
            },
          }),
      finish_reason: 'tool_calls',
    };
    const result = await invoke([{ choices: [other, primary] }], stream);
    expect(result.error).toBeUndefined();
    expect(result.calls).toEqual([
      { id: 'call', name: 'complete_task', args: { result: 'primary' } },
    ]);
    expect(result.text).not.toContain('PRIVATE_ALTERNATIVE');
  },
);
it('does not append alternative argument fragments or stop on their abnormal finish', async () => {
  const result = await invoke([
    { choices: [{ index: 0, delta: { tool_calls: [tc('{"result":')] } }] },
    {
      choices: [
        {
          index: 1,
          delta: {
            content: 'PRIVATE_ALTERNATIVE',
            reasoning_content: 'PRIVATE_THOUGHT',
            tool_calls: [tc('"other"}')],
          },
          finish_reason: 'length',
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [tc('"primary"}')] },
          finish_reason: 'tool_calls',
        },
      ],
    },
    {
      choices: [],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    },
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'call', name: 'complete_task', args: { result: 'primary' } },
  ]);
  expect(result.text).not.toContain('PRIVATE_');
  expect(result.totalTokens).toBe(8);
});
it.each([false, true])(
  'rejects a response with only a nonprimary candidate (stream=%s)',
  async (stream) => {
    const result = await invoke(
      [
        {
          choices: [
            {
              index: 1,
              ...(stream
                ? { delta: { tool_calls: [tc('{}')] } }
                : { message: { tool_calls: [tc('{}')] } }),
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      stream,
    );
    expect(result.error).toBeInstanceOf(Error);
    expect(result.calls).toEqual([]);
  },
);
it.each([
  [
    'missing indices',
    [
      { delta: { tool_calls: [tc('{}')] }, finish_reason: 'tool_calls' },
      { delta: { content: 'other' } },
    ],
  ],
  [
    'duplicate zero',
    [
      {
        index: 0,
        delta: { tool_calls: [tc('{}')] },
        finish_reason: 'tool_calls',
      },
      { index: 0, delta: { content: 'other' } },
    ],
  ],
  [
    'mixed indices',
    [
      {
        index: 0,
        delta: { tool_calls: [tc('{}')] },
        finish_reason: 'tool_calls',
      },
      { delta: { content: 'other' } },
    ],
  ],
] as const)(
  'rejects ambiguous %s before releasing calls',
  async (_name, choices) => {
    const result = await invoke([{ choices }]);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.calls).toEqual([]);
  },
);
it('retains single omitted-index compatibility', async () => {
  const result = await invoke([
    {
      choices: [
        { delta: { tool_calls: [tc('{}')] }, finish_reason: 'tool_calls' },
      ],
    },
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'call', name: 'complete_task', args: {} },
  ]);
});
