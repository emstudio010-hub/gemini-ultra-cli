/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GenerateContentResponse, type Content } from '@google/genai';
import { ProviderManager } from './providerManager.js';
import { UniversalContentGenerator } from './universalContentGenerator.js';
import {
  providerReasoningSignature,
  shouldReplayReasoning,
} from './providerReasoning.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { getResponseText } from '../utils/partUtils.js';
import {
  scrubHistory,
  scrubContents,
  hardenHistory,
  hasNonThoughtParts,
} from '../utils/historyHardening.js';
import { stripThoughts } from '../core/geminiChat.js';
import type { ContentGenerator } from '../core/contentGenerator.js';

describe('provider reasoning replay', () => {
  let directory: string;
  const model = 'deepseek-fixture';
  const raw = '  exact reasoning\nwith whitespace \t';
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'read_file',
          parametersJsonSchema: { type: 'object', properties: {} },
        },
      ],
    },
  ];
  const fixture = {
    choices: [
      {
        message: {
          content: 'Visible',
          reasoning_content: raw,
          tool_calls: [
            { id: 'call1', function: { name: 'read_file', arguments: '{}' } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
  const fallbackGenerate = vi
    .fn<ContentGenerator['generateContent']>()
    .mockResolvedValue(new GenerateContentResponse());
  const fallbackCount = vi
    .fn<ContentGenerator['countTokens']>()
    .mockResolvedValue({ totalTokens: 1 });
  const fallback: ContentGenerator = {
    generateContent: fallbackGenerate,
    generateContentStream: vi.fn(),
    countTokens: fallbackCount,
    embedContent: vi.fn(),
  };
  const fetchMock = vi.fn<typeof fetch>();
  const body = () => JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'ultra-reasoning-'));
    vi.stubEnv(
      'GEMINI_ULTRA_PROVIDERS_FILE',
      path.join(directory, 'providers.json'),
    );
    ProviderManager.resetInstance();
    ProviderManager.getInstance().upsertProvider({
      name: 'Fixture',
      baseUrl: 'https://fixture.invalid/v1',
      apiKey: '',
      protocol: 'openai-chat',
      models: [model, 'plain-fixture'],
    });
    fetchMock
      .mockReset()
      .mockImplementation(async () => new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    ProviderManager.resetInstance();
    rmSync(directory, { recursive: true, force: true });
  });
  const provider = () => {
    const value = ProviderManager.getInstance().getActiveProvider();
    if (!value) throw new Error('Missing fixture provider');
    return value;
  };
  const contents = (): Content[] => [
    {
      role: 'model',
      parts: [
        {
          text: raw,
          thought: true,
          thoughtSignature: providerReasoningSignature(provider(), model),
        },
        { text: 'Visible' },
        { functionCall: { id: 'call1', name: 'read_file', args: {} } },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call1',
            name: 'read_file',
            response: { ok: true },
          },
        },
      ],
    },
  ];

  it('persists automatic, enabled and disabled modes through unrelated edits', () => {
    const manager = ProviderManager.getInstance();
    expect(shouldReplayReasoning(provider(), model)).toBe(true);
    expect(shouldReplayReasoning(provider(), 'plain-fixture')).toBe(false);
    manager.upsertProvider({ ...provider(), reasoningReplay: 'off' });
    const { reasoningReplay: _mode, ...input } = provider();
    void _mode;
    manager.upsertProvider({ ...input, name: 'Renamed' });
    expect(
      new ProviderManager(
        path.join(directory, 'providers.json'),
      ).getActiveProvider()?.reasoningReplay,
    ).toBe('off');
    expect(shouldReplayReasoning(provider(), model)).toBe(false);
    manager.upsertProvider({ ...provider(), reasoningReplay: 'on' });
    expect(shouldReplayReasoning(provider(), 'plain-fixture')).toBe(true);
    manager.upsertProvider({ ...provider(), reasoningReplay: 'auto' });
    expect(shouldReplayReasoning(provider(), 'plain-fixture')).toBe(false);
  });

  it('replays exact provider reasoning on tool turns without adding it to visible text', async () => {
    const generator = new UniversalContentGenerator(fallback);
    const response = await generator.generateContent(
      { model, contents: 'fixture', config: { tools } },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(getResponseText(response)).toBe('Visible');
    const parts = response.candidates?.[0]?.content?.parts;
    expect(parts?.find((part) => part.thought)?.thoughtSignature).toBe(
      providerReasoningSignature(provider(), model),
    );
    await generator.generateContent(
      {
        model,
        contents: [{ role: 'model', parts }, contents()[1]],
        config: { tools },
      },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(body().messages[0]).toMatchObject({
      role: 'assistant',
      content: 'Visible',
      reasoning_content: raw,
    });
  });

  it('honors disabled replay and endpoint/model boundaries', async () => {
    const generator = new UniversalContentGenerator(fallback);
    const history = contents();
    const manager = ProviderManager.getInstance();
    manager.upsertProvider({ ...provider(), reasoningReplay: 'off' });
    await generator.generateContent(
      { model, contents: history, config: { tools } },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(body().messages[0].reasoning_content).toBeUndefined();
    manager.upsertProvider({ ...provider(), reasoningReplay: 'on' });
    await generator.generateContent(
      { model: 'plain-fixture', contents: history, config: { tools } },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(body().messages[0].reasoning_content).toBeUndefined();
    manager.upsertProvider({
      ...provider(),
      baseUrl: 'https://other.invalid/v1',
    });
    await generator.generateContent(
      { model, contents: history, config: { tools } },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(body().messages[0].reasoning_content).toBeUndefined();
  });

  it('omits replay when the request does not carry tools', async () => {
    await new UniversalContentGenerator(fallback).generateContent(
      { model, contents: contents() },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(body().messages[0].reasoning_content).toBeUndefined();
    expect(body().messages[0].content).toBe('Visible');
  });

  it('removes external continuation data from native requests and preserves native signatures', async () => {
    const generator = new UniversalContentGenerator(fallback);
    const history = contents();
    history[0].parts?.push({
      functionCall: { id: 'native', name: 'native', args: {} },
      thoughtSignature: 'native-signature',
    });
    history[0].parts?.push({
      functionCall: { id: 'transferred', name: 'other', args: {} },
      thoughtSignature: providerReasoningSignature(provider(), model),
    });
    await generator.generateContent(
      { model: 'unregistered-native', contents: history },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    const sent = fallbackGenerate.mock.calls[0]?.[0];
    expect(JSON.stringify(sent)).not.toContain('exact reasoning');
    expect(JSON.stringify(sent)).not.toContain('ultra-chat-reasoning-v1:');
    expect(JSON.stringify(sent)).toContain('native-signature');
    await generator.countTokens({
      model: 'unregistered-native',
      contents: history,
    });
    expect(JSON.stringify(fallbackCount.mock.calls[0])).not.toContain(
      'ultra-chat-reasoning-v1:',
    );
    ProviderManager.getInstance().upsertProvider({
      name: 'Native',
      baseUrl: 'https://gemini.invalid',
      apiKey: '',
      protocol: 'gemini',
      models: ['native-fixture'],
    });
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Native response' }],
                },
              },
            ],
          }),
        ),
    );
    await generator.generateContent(
      { model: 'native-fixture', contents: history },
      'fixture',
      LlmRole.UTILITY_TOOL,
    );
    expect(JSON.stringify(body())).not.toContain('ultra-chat-reasoning-v1:');
    expect(JSON.stringify(body())).toContain('native-signature');
  });

  it('keeps bound reasoning through history scrubbing while ordinary thoughts stay internal', () => {
    const history = contents();
    history[0].parts?.unshift({ text: 'ordinary thought', thought: true });
    const turns = history.map((content, index) => ({
      id: String(index),
      content,
    }));
    for (const result of [
      scrubHistory(turns).map((turn) => turn.content),
      scrubContents(history),
      stripThoughts(turns).map((turn) => turn.content),
      hardenHistory(turns).map((turn) => turn.content),
    ]) {
      expect(
        result
          .flatMap((content) => content.parts ?? [])
          .some((part) => part.text === raw && part.thought),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain('ordinary thought');
    }
    expect(
      hasNonThoughtParts({
        role: 'model',
        parts: [history[0].parts?.[1] ?? {}],
      }),
    ).toBe(false);
  });
});
