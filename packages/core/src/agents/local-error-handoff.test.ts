/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { LocalAgentExecutor } from './local-executor.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { LocalSessionInvocation } from './local-session-invocation.js';
import type { LocalAgentDefinition } from './types.js';
import { SubagentState } from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ProviderToolArgumentsError } from '../providers/providerToolArguments.js';
import type { AgentEvent } from '../agent/types.js';
import type { z } from 'zod';
vi.mock('./local-executor.js');
afterEach(() => vi.restoreAllMocks());
const definition: LocalAgentDefinition = {
  kind: 'local',
  name: 'diagnostic',
  description: 'Fixture',
  inputConfig: {
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  modelConfig: { model: 'fixture', generateContentConfig: {} },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'Fixture' },
};
it.each(['direct', 'session'] as const)(
  '%s redacts thrown credentials across result, progress, events and own debug log',
  async (entry) => {
    const failure = new Error(
      'HTTP 401 api_key=PRIVATE_API_KEY token=PRIVATE_ACCESS_TOKEN',
    );
    vi.mocked(LocalAgentExecutor.create).mockResolvedValue({
      run: vi.fn().mockRejectedValue(failure),
      agentId: 'fixture',
    } as unknown as LocalAgentExecutor<z.ZodTypeAny>);
    const logger = vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    const events: AgentEvent[] = [];
    const updateOutput = vi.fn();
    const context = makeFakeConfig();
    const bus = createMockMessageBus();
    const invocation =
      entry === 'direct'
        ? new LocalSubagentInvocation(
            definition,
            context,
            { query: 'Fixture' },
            bus,
          )
        : new LocalSessionInvocation(
            definition,
            context,
            { query: 'Fixture' },
            bus,
            { onAgentEvent: (e) => events.push(e) },
          );
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
      updateOutput,
    });
    const visible = JSON.stringify({
      result,
      progress: updateOutput.mock.calls,
      events,
      logs: logger.mock.calls.map((call) =>
        call.map((value) =>
          value instanceof Error
            ? { message: value.message, stack: value.stack }
            : value,
        ),
      ),
    });
    expect(visible).not.toContain('PRIVATE_');
    expect(visible).toContain('[REDACTED]');
    expect(result.returnDisplay).toMatchObject({ state: SubagentState.ERROR });
    if (entry === 'session') {
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'agent_end', reason: 'failed' }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('[REDACTED]'),
        }),
      );
    }
  },
);
it.each(['direct', 'session'] as const)(
  '%s preserves safe provider argument diagnostics on failure',
  async (entry) => {
    const failure = new ProviderToolArgumentsError(
      'openai-chat',
      'complete_task',
      48,
      42,
      'invalid-json',
      35,
    );
    vi.mocked(LocalAgentExecutor.create).mockResolvedValue({
      run: vi.fn().mockRejectedValue(failure),
      agentId: 'fixture',
    } as unknown as LocalAgentExecutor<z.ZodTypeAny>);
    vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    const context = makeFakeConfig();
    const bus = createMockMessageBus();
    const events: AgentEvent[] = [];
    const invocation =
      entry === 'direct'
        ? new LocalSubagentInvocation(
            definition,
            context,
            { query: 'Fixture' },
            bus,
          )
        : new LocalSessionInvocation(
            definition,
            context,
            { query: 'Fixture' },
            bus,
            { onAgentEvent: (e) => events.push(e) },
          );
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
      updateOutput: vi.fn(),
    });
    expect(result.llmContent).toContain(failure.message);
    expect(result.returnDisplay).toMatchObject({ state: SubagentState.ERROR });
    if (entry === 'session')
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'error', message: failure.message }),
      );
  },
);
