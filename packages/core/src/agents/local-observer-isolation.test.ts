/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { LocalSubagentSession } from './local-subagent-protocol.js';
import { LocalAgentExecutor } from './local-executor.js';
import { AgentTerminateMode, type LocalAgentDefinition } from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { AgentEvent } from '../agent/types.js';
import type { z } from 'zod';
vi.mock('./local-executor.js');
afterEach(() => vi.restoreAllMocks());
const definition: LocalAgentDefinition = {
  kind: 'local',
  name: 'observer-fixture',
  description: 'Fixture',
  inputConfig: {
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  modelConfig: { model: 'fixture', generateContentConfig: {} },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'Fixture' },
};
const output = {
  result: 'PRIMARY_RESULT',
  terminate_reason: AgentTerminateMode.GOAL,
};
function makeSession(rawActivityCallback?: () => void) {
  vi.mocked(LocalAgentExecutor.create).mockImplementation(
    async (_def, _ctx, onActivity) =>
      ({
        run: async () => {
          onActivity?.({
            isSubagentActivityEvent: true,
            agentName: 'fixture',
            type: 'THOUGHT_CHUNK',
            data: { text: 'PRIMARY_THOUGHT' },
          });
          return output;
        },
      }) as unknown as LocalAgentExecutor<z.ZodTypeAny>,
  );
  vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
  return new LocalSubagentSession(
    definition,
    makeFakeConfig(),
    createMockMessageBus(),
    rawActivityCallback,
  );
}
it('keeps the executor result and healthy event delivery after a message observer throws', async () => {
  const session = makeSession();
  const events: AgentEvent[] = [];
  session.subscribe((e) => {
    if (e.type === 'message') throw Error('PRIVATE_OBSERVER_FAILURE');
  });
  session.subscribe((e) => events.push(e));
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await expect(session.getResult()).resolves.toEqual(output);
  expect(events.map((e) => e.type)).toEqual([
    'agent_start',
    'message',
    'agent_end',
  ]);
  expect(events.at(-1)).toMatchObject({
    type: 'agent_end',
    reason: 'completed',
  });
});
it('keeps the executor result and translated events after a raw activity observer throws', async () => {
  const session = makeSession(() => {
    throw Error('PRIVATE_RAW_FAILURE');
  });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await expect(session.getResult()).resolves.toEqual(output);
  expect(events.map((e) => e.type)).toEqual([
    'agent_start',
    'message',
    'agent_end',
  ]);
});
it('retains a normal observer and raw activity control', async () => {
  const raw = vi.fn();
  const session = makeSession(raw);
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await expect(session.getResult()).resolves.toEqual(output);
  expect(raw).toHaveBeenCalledOnce();
  expect(events.map((e) => e.type)).toEqual([
    'agent_start',
    'message',
    'agent_end',
  ]);
});
it.each(['agent_start', 'agent_end'] as const)(
  'settles and preserves healthy lifecycle when an observer throws on %s',
  async (type) => {
    const session = makeSession();
    const events: AgentEvent[] = [];
    session.subscribe((e) => {
      if (e.type === type) throw Error('PRIVATE_LIFECYCLE_FAILURE');
    });
    session.subscribe((e) => events.push(e));
    await session.send({
      message: { content: [{ type: 'text', text: 'Fixture' }] },
    });
    await expect(session.getResult()).resolves.toEqual(output);
    expect(events.map((e) => e.type)).toEqual([
      'agent_start',
      'message',
      'agent_end',
    ]);
  },
);
it('preserves the original executor failure when an error observer throws', async () => {
  const session = makeSession();
  const failure = new Error('ORIGINAL_EXECUTOR_FAILURE');
  const events: AgentEvent[] = [];
  vi.mocked(LocalAgentExecutor.create).mockResolvedValue({
    run: vi.fn().mockRejectedValue(failure),
  } as unknown as LocalAgentExecutor<z.ZodTypeAny>);
  session.subscribe((e) => {
    if (e.type === 'error') throw Error('PRIVATE_ERROR_OBSERVER_FAILURE');
  });
  session.subscribe((e) => events.push(e));
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await expect(session.getResult()).rejects.toBe(failure);
  expect(events.at(-1)).toMatchObject({ type: 'agent_end', reason: 'failed' });
  expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
});
it.each(['events', 'raw'] as const)(
  'handles async %s observer rejection without changing completion',
  async (kind) => {
    const rejected = async () => {
      throw Error('PRIVATE_ASYNC_FAILURE');
    };
    const session = makeSession(kind === 'raw' ? rejected : undefined);
    const events: AgentEvent[] = [];
    if (kind === 'events')
      session.subscribe(async (e) => {
        if (e.type === 'message') await rejected();
      });
    session.subscribe((e) => events.push(e));
    await session.send({
      message: { content: [{ type: 'text', text: 'Fixture' }] },
    });
    await expect(session.getResult()).resolves.toEqual(output);
    await Promise.resolve();
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'completed',
    });
    expect(
      JSON.stringify(vi.mocked(debugLogger.warn).mock.calls),
    ).not.toContain('PRIVATE_');
  },
);
it('detaches a failed observer once and permits the next stream to complete', async () => {
  const session = makeSession();
  const bad = vi.fn(() => {
    throw Error('PRIVATE_FAILURE');
  });
  const events: AgentEvent[] = [];
  session.subscribe(bad);
  session.subscribe((e) => events.push(e));
  for (let index = 0; index < 2; index++) {
    await session.send({
      message: { content: [{ type: 'text', text: 'Fixture' }] },
    });
    await expect(session.getResult()).resolves.toEqual(output);
  }
  expect(bad).toHaveBeenCalledOnce();
  expect(debugLogger.warn).toHaveBeenCalledOnce();
  expect(events.filter((e) => e.type === 'agent_end')).toHaveLength(2);
});
it('preserves duplicate subscription and unsubscribe semantics for a healthy observer', async () => {
  const session = makeSession();
  const observer = vi.fn();
  const unsubscribe = session.subscribe(observer);
  session.subscribe(observer);
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await session.getResult();
  expect(observer).toHaveBeenCalledTimes(3);
  unsubscribe();
  await session.send({
    message: { content: [{ type: 'text', text: 'Fixture' }] },
  });
  await session.getResult();
  expect(observer).toHaveBeenCalledTimes(3);
});
