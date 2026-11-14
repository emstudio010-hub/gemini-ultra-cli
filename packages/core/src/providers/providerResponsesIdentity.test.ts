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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-responses-identity-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_ONLY',
    protocol: 'openai-responses',
    models: ['fixture'],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});
const added = (id = 'item', callId = 'call', name = 'complete_task') => ({
  type: 'response.output_item.added',
  item: { type: 'function_call', id, call_id: callId, name },
});
const delta = (id: string | undefined, value: string) => ({
  type: 'response.function_call_arguments.delta',
  item_id: id,
  delta: value,
});
const done = (id: string | undefined, value: string) => ({
  type: 'response.function_call_arguments.done',
  item_id: id,
  arguments: value,
});
async function collect(events: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          [
            ...events,
            { type: 'response.completed', response: { status: 'completed' } },
          ]
            .map((value) => `data: ${JSON.stringify(value)}\n\n`)
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
    for await (const response of await generator.generateContentStream(
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
      calls.push(...(response.functionCalls ?? []));
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
}
it.each([
  [
    'orphan delta',
    [added(), delta('unknown', '{"PRIVATE_MARKER":1}'), done('item', '{}')],
  ],
  ['missing delta item', [added(), delta(undefined, '{}'), done('item', '{}')]],
  ['orphan done', [added(), done('unknown', '{}'), done('item', '{}')]],
  [
    'reused call ID',
    [added(), added('other', 'call'), done('item', '{}'), done('other', '{}')],
  ],
  [
    'changed item identity',
    [added(), added('item', 'changed-call'), done('item', '{}')],
  ],
  [
    'changed item name',
    [added(), added('item', 'call', 'other_tool'), done('item', '{}')],
  ],
  ['late delta', [added(), done('item', '{}'), delta('item', ' ')]],
  [
    'contradictory done',
    [added(), done('item', '{"result":1}'), done('item', '{"result":2}')],
  ],
] as const)(
  'rejects %s without releasing a tool batch',
  async (_name, events) => {
    const result = await collect([...events]);
    expect(result.error).toBeInstanceOf(Error);
    expect(String(result.error)).toContain('OpenAI Responses');
    expect(String(result.error)).not.toContain('PRIVATE_MARKER');
    expect(result.calls).toEqual([]);
  },
);
it('keeps argument fragments when the same declaration is repeated', async () => {
  const result = await collect([
    added(),
    delta('item', '{"result":'),
    added(),
    delta('item', '1}'),
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'call', name: 'complete_task', args: { result: 1 } },
  ]);
});
it('accepts interleaved calls and repeated identical final arguments', async () => {
  const result = await collect([
    added(),
    added('other', 'second'),
    delta('item', '{"x":'),
    delta('other', '{"y":'),
    delta('item', '1}'),
    done('other', '{"y":2}'),
    done('item', '{"x":1}'),
    done('item', '{"x":1}'),
  ]);
  expect(result.error).toBeUndefined();
  expect(result.calls).toEqual([
    { id: 'call', name: 'complete_task', args: { x: 1 } },
    { id: 'second', name: 'complete_task', args: { y: 2 } },
  ]);
});
