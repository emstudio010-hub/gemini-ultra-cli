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
import { I18nManager } from '../i18n/i18nManager.js';
import { LlmRole } from '../telemetry/llmRole.js';

let root: string;
let previousLocale: 'zh' | 'en';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-argument-diagnostic-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  previousLocale = I18nManager.getInstance().getLocale();
  I18nManager.getInstance().setLocale('en');
  ProviderManager.resetInstance();
});
afterEach(() => {
  I18nManager.getInstance().setLocale(previousLocale);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ProviderManager.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
async function invoke(
  mode: 'chat' | 'chat-stream' | 'responses' | 'anthropic',
  args: string,
  name = 'complete_task',
) {
  const protocol = mode.startsWith('chat')
    ? 'openai-chat'
    : mode === 'responses'
      ? 'openai-responses'
      : 'anthropic';
  ProviderManager.getInstance().upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FIXTURE_KEY_NEVER_ECHO',
    protocol,
    models: ['fixture'],
  });
  let body: string;
  if (mode === 'chat')
    body = JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [{ id: 'call', function: { name, arguments: args } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
  else if (mode === 'chat-stream')
    body =
      frame({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call', function: { name, arguments: args } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }) + 'data: [DONE]\n\n';
  else if (mode === 'responses')
    body =
      frame({
        type: 'response.output_item.added',
        item: { type: 'function_call', id: 'item', call_id: 'call', name },
      }) +
      frame({
        type: 'response.function_call_arguments.done',
        item_id: 'item',
        arguments: args,
      }) +
      frame({ type: 'response.completed', response: { status: 'completed' } });
  else
    body =
      frame({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'call', name, input: {} },
      }) +
      frame({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: args },
      }) +
      frame({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }) +
      frame({ type: 'message_stop' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body, {
        headers: {
          'content-type':
            mode === 'chat' ? 'application/json' : 'text/event-stream',
        },
      }),
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
  let error: unknown;
  const calls: unknown[] = [];
  try {
    if (mode === 'chat')
      calls.push(
        ...((
          await generator.generateContent(request, 'fixture', LlmRole.SUBAGENT)
        ).functionCalls ?? []),
      );
    else
      for await (const chunk of await generator.generateContentStream(
        request,
        'fixture',
        LlmRole.SUBAGENT,
      ))
        calls.push(...(chunk.functionCalls ?? []));
  } catch (caught) {
    error = caught;
  }
  return { error, calls, protocol };
}

it.each(['chat', 'chat-stream', 'responses', 'anthropic'] as const)(
  'identifies malformed arguments safely through %s without releasing calls',
  async (mode) => {
    const args = '{"result":"PRIVATE_ARGUMENT_MARKER_票据🧪", broken}';
    let position: number | undefined;
    try {
      JSON.parse(args);
    } catch (e) {
      const match = String(e).match(/position (\d+)/);
      if (match) position = Number(match[1]);
    }
    const { error, calls, protocol } = await invoke(mode, args);
    expect(error).toMatchObject({
      name: 'ProviderToolArgumentsError',
      protocol,
      toolName: 'complete_task',
      argumentBytes: Buffer.byteLength(args),
      argumentChars: args.length,
      reason: 'invalid-json',
      jsonPosition: position,
    });
    const display = String(error) + JSON.stringify(error);
    expect(display).toContain('complete_task');
    expect(display).toContain(String(Buffer.byteLength(args)));
    expect(display).not.toContain('PRIVATE_ARGUMENT_MARKER');
    expect(display).not.toContain('FIXTURE_KEY_NEVER_ECHO');
    expect(display).not.toContain('broken');
    expect(calls).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  },
);
it('reports a non-object root separately and omits an undeclared tool name', async () => {
  const { error, calls } = await invoke(
    'chat-stream',
    '["PRIVATE_ROOT_MARKER"]',
    'PRIVATE_UNDECLARED_TOOL',
  );
  expect(error).toMatchObject({
    name: 'ProviderToolArgumentsError',
    reason: 'non-object',
    toolName: undefined,
  });
  expect(String(error) + JSON.stringify(error)).not.toMatch(
    /PRIVATE_ROOT_MARKER|PRIVATE_UNDECLARED_TOOL/,
  );
  expect(calls).toEqual([]);
});
it('localizes the actionable failure while retaining stable diagnostic fields', async () => {
  I18nManager.getInstance().setLocale('zh');
  const { error } = await invoke('chat-stream', '{"result":');
  expect(error).toMatchObject({
    name: 'ProviderToolArgumentsError',
    reason: 'invalid-json',
    jsonPosition: 10,
  });
  expect(String(error)).toContain('未执行');
  expect(String(error)).toContain('UTF-16');
});
it('keeps valid arguments unchanged', async () => {
  const args = { result: { response: 'Valid 票据🧪' } };
  const { error, calls } = await invoke('chat-stream', JSON.stringify(args));
  expect(error).toBeUndefined();
  expect(calls).toEqual([{ id: 'call', name: 'complete_task', args }]);
});
