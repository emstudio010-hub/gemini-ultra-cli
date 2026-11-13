/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GenerateContentResponse } from '@google/genai';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import { ProviderManager } from './providerManager.js';
import { LlmRole } from '../telemetry/llmRole.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-tool-identity-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    protocol: 'openai-chat',
    models: ['identity-fixture'],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const call = (
  index: number,
  id: string | undefined,
  name: string | undefined,
  args: string,
) => ({ index, id, function: { name, arguments: args } });
async function collect(deltas: unknown[], toolNames = ['complete_task']) {
  const events: unknown[] = deltas.map((tool_calls) => ({
    choices: [{ delta: { tool_calls } }],
  }));
  events.push({
    choices: [{ delta: { tool_calls: [] }, finish_reason: 'tool_calls' }],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          events
            .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
            .join('') + 'data: [DONE]\n\n',
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
  const chunks: GenerateContentResponse[] = [];
  let error: unknown;
  try {
    for await (const chunk of await generator.generateContentStream(
      {
        model: 'identity-fixture',
        contents: 'Fixture',
        config: {
          tools: [
            {
              functionDeclarations: toolNames.map((name) => ({
                name,
                parametersJsonSchema: { type: 'object', properties: {} },
              })),
            },
          ],
        },
      },
      'identity',
      LlmRole.SUBAGENT,
    ))
      chunks.push(chunk);
  } catch (caught) {
    error = caught;
  }
  return { calls: chunks.flatMap((chunk) => chunk.functionCalls ?? []), error };
}

it('keeps a repeated declared full function name once while assembling argument fragments', async () => {
  const result = await collect([
    [call(0, 'one', 'complete_task', '{"result":')],
    [call(0, 'one', 'complete_task', '{"response":"saved"}}')],
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    {
      id: 'one',
      name: 'complete_task',
      args: { result: { response: 'saved' } },
    },
  ]);
});
it('rejects changing call IDs within one index without releasing any collected call', async () => {
  const result = await collect([
    [call(0, 'one', 'complete_task', '{"result":')],
    [call(0, 'other', undefined, '{"response":"mixed"}}')],
  ]);
  expect(result.error).toMatchObject({
    message: expect.stringContaining('changed its ID'),
  });
  expect(result.calls).toEqual([]);
});
it('rejects a single call ID reused at two indices before releasing either call', async () => {
  const result = await collect([
    [
      call(0, 'same', 'complete_task', '{}'),
      call(1, 'same', 'complete_task', '{}'),
    ],
  ]);
  expect(result.error).toMatchObject({
    message: expect.stringContaining('multiple indices'),
  });
  expect(result.calls).toEqual([]);
});
it('preserves distinct interleaved call IDs, fragment order and names', async () => {
  const result = await collect(
    [
      [
        call(0, 'first', 'complete_', '{"x":'),
        call(1, 'second', 'read_', '{"path":'),
      ],
      [
        call(1, undefined, 'file', '"file.txt"}'),
        call(0, undefined, 'task', '1}'),
      ],
    ],
    ['complete_task', 'read_file'],
  );
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'first', name: 'complete_task', args: { x: 1 } },
    { id: 'second', name: 'read_file', args: { path: 'file.txt' } },
  ]);
});
it('does not deduplicate repeated name fragments that are not a declared full name', async () => {
  const result = await collect(
    [[call(0, 'repeat', 'part', '{')], [call(0, undefined, 'part', '}')]],
    ['partpart'],
  );
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([{ id: 'repeat', name: 'partpart', args: {} }]);
});

it('preserves repeated fragments when their concatenation is also a declared tool', async () => {
  const result = await collect(
    [[call(0, 'repeat', 'part', '{')], [call(0, undefined, 'part', '}')]],
    ['part', 'partpart'],
  );
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([{ id: 'repeat', name: 'partpart', args: {} }]);
});
