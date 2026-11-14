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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-anthropic-blocks-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    protocol: 'anthropic',
    models: ['fixture'],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const start = (index: number, id: string) => ({
  type: 'content_block_start',
  index,
  content_block: { type: 'tool_use', id, name: 'complete_task', input: {} },
});
const delta = (index: number, partial_json: string) => ({
  type: 'content_block_delta',
  index,
  delta: { type: 'input_json_delta', partial_json },
});
const stop = (index: number) => ({ type: 'content_block_stop', index });
async function collect(events: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          [...events, { type: 'message_stop' }]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    ),
  );
  const generator = new UniversalContentGenerator({
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  });
  const calls: unknown[] = [];
  let error: unknown;
  try {
    for await (const chunk of await generator.generateContentStream(
      {
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
      },
      'fixture',
      LlmRole.SUBAGENT,
    ))
      calls.push(...(chunk.functionCalls ?? []));
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
}

const invalidStreams: Array<[string, unknown[]]> = [
  [
    'reused block index',
    [start(0, 'first'), delta(0, '{}'), start(0, 'second'), delta(0, '{}')],
  ],
  [
    'reused tool ID',
    [start(0, 'same'), delta(0, '{}'), start(1, 'same'), delta(1, '{}')],
  ],
  [
    'unknown argument block',
    [start(0, 'valid'), delta(0, '{}'), delta(1, '{"PRIVATE_BLOCK_MARKER":1}')],
  ],
  [
    'closed argument block',
    [start(0, 'valid'), delta(0, '{}'), stop(0), delta(0, ' ')],
  ],
  [
    'retyped block index',
    [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
      start(0, 'tool'),
      delta(0, '{}'),
    ],
  ],
];
it.each(invalidStreams)(
  'rejects %s without publishing any tool calls or provider values',
  async (_name, events) => {
    const result = await collect(events);
    expect(result.error).toBeInstanceOf(Error);
    expect(String(result.error)).toContain('Anthropic:');
    expect(String(result.error) + JSON.stringify(result.error)).not.toContain(
      'PRIVATE_BLOCK_MARKER',
    );
    expect(result.calls).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  },
);

it('preserves interleaved tool fragments, initial object input and ordinary text blocks', async () => {
  const result = await collect([
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Visible evidence' },
    },
    stop(0),
    start(1, 'first'),
    delta(1, '{"value":'),
    {
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'tool_use',
        id: 'second',
        name: 'complete_task',
        input: { value: '初始🧪' },
      },
    },
    delta(1, '7}'),
    stop(1),
    stop(2),
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'first', name: 'complete_task', args: { value: 7 } },
    { id: 'second', name: 'complete_task', args: { value: '初始🧪' } },
  ]);
});
