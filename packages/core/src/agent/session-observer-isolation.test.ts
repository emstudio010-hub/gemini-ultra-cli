/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { FinishReason } from '@google/genai';
import { LegacyAgentSession } from './legacy-agent-session.js';
import { RemoteSubagentSession } from '../agents/remote-subagent-protocol.js';
import { GeminiEventType } from '../core/turn.js';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { AgentEvent } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';
afterEach(() => vi.restoreAllMocks());
const send = {
  message: { content: [{ type: 'text' as const, text: 'Fixture' }] },
};
function makeSession(kind: 'legacy' | 'remote', failure?: Error) {
  vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
  if (kind === 'legacy') {
    const client = {
      async *sendMessageStream() {
        if (failure) throw failure;
        yield { type: GeminiEventType.Content, value: 'PRIMARY_RESULT' };
        yield {
          type: GeminiEventType.Finished,
          value: { reason: FinishReason.STOP },
        };
      },
    };
    return new LegacyAgentSession({
      config: { getMaxSessionTurns: () => -1 } as unknown as Config,
      client: client as unknown as GeminiClient,
      scheduler: { schedule: vi.fn() } as unknown as Scheduler,
    });
  }
  const manager = {
    getClient: () => ({}),
    async *sendMessageStream() {
      if (failure) throw failure;
      yield {
        kind: 'message',
        messageId: 'fixture',
        role: 'agent',
        parts: [{ kind: 'text', text: 'PRIMARY_RESULT' }],
      };
    },
  };
  return new RemoteSubagentSession(
    {
      kind: 'remote',
      name: 'fixture',
      description: 'Fixture',
      agentCardUrl: 'https://fixture.invalid/card',
      inputConfig: { inputSchema: { type: 'object' } },
    },
    {
      config: { getA2AClientManager: () => manager },
    } as unknown as AgentLoopContext,
    createMockMessageBus(),
  );
}
async function run(session: LegacyAgentSession | RemoteSubagentSession) {
  const { streamId } = await session.send(send);
  const completion =
    session instanceof RemoteSubagentSession
      ? session.getResult().then(
          () => ({}),
          (error: unknown) => ({ error }),
        )
      : undefined;
  const events: AgentEvent[] = [];
  for await (const event of session.stream({ streamId: streamId ?? undefined }))
    events.push(event);
  const outcome = await completion;
  if (outcome && 'error' in outcome) throw outcome.error;
  return events;
}
it.each(['legacy', 'remote'] as const)(
  '%s keeps the original completion when a streamed message observer throws',
  async (kind) => {
    const session = makeSession(kind);
    session.subscribe((event) => {
      if (event.type === 'message' && event.role === 'agent')
        throw Error('PRIVATE_OBSERVER_FAILURE');
    });
    const events = await run(session);
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'completed',
    });
    expect(JSON.stringify(events)).toContain('PRIMARY_RESULT');
  },
);
it.each(['legacy', 'remote'] as const)(
  '%s isolates async streamed observer rejections',
  async (kind) => {
    const session = makeSession(kind);
    const bad = vi.fn(async (event: AgentEvent) => {
      if (event.type === 'message' && event.role === 'agent')
        throw Error('PRIVATE_ASYNC_FAILURE');
    });
    session.subscribe(bad);
    const events = await run(session);
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
it.each(['legacy', 'remote'] as const)(
  '%s keeps lifecycle settlement after start and end observer failures',
  async (kind) => {
    const session = makeSession(kind);
    session.subscribe((event) => {
      if (event.type === 'agent_start') throw Error('PRIVATE_START');
    });
    session.subscribe((event) => {
      if (event.type === 'agent_end') throw Error('PRIVATE_END');
    });
    const events = await run(session);
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'completed',
    });
    expect(events.filter((e) => e.type === 'agent_start')).toHaveLength(1);
  },
);
it.each(['legacy', 'remote'] as const)(
  '%s retains the original failure when an error observer throws',
  async (kind) => {
    const failure = new Error('ORIGINAL_FAILURE');
    const session = makeSession(kind, failure);
    const captured: AgentEvent[] = [];
    session.subscribe((event) => {
      if (event.type === 'error') throw Error('PRIVATE_ERROR');
    });
    session.subscribe((event) => captured.push(event));
    if (kind === 'remote') await expect(run(session)).rejects.toBe(failure);
    else await run(session);
    expect(captured.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'failed',
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('ORIGINAL_FAILURE'),
      }),
    );
  },
);
it.each(['legacy', 'remote'] as const)(
  '%s detaches a failed observer and permits the next stream',
  async (kind) => {
    const session = makeSession(kind);
    const bad = vi.fn(() => {
      throw Error('PRIVATE_OBSERVER');
    });
    session.subscribe(bad);
    await run(session);
    const events = await run(session);
    expect(bad).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'completed',
    });
  },
);
it.each(['legacy', 'remote'] as const)(
  '%s preserves duplicate subscription and unsubscribe behavior',
  async (kind) => {
    const session = makeSession(kind);
    const observer = vi.fn();
    const unsubscribe = session.subscribe(observer);
    session.subscribe(observer);
    await run(session);
    const count = observer.mock.calls.length;
    expect(count).toBe(kind === 'legacy' ? 4 : 3);
    unsubscribe();
    await run(session);
    expect(observer).toHaveBeenCalledTimes(count);
  },
);
it('legacy can send when the user-message observer fails before scheduling', async () => {
  const session = makeSession('legacy');
  session.subscribe((event) => {
    if (event.type === 'message' && event.role === 'user')
      throw Error('PRIVATE_USER_OBSERVER');
  });
  expect((await run(session)).at(-1)).toMatchObject({
    type: 'agent_end',
    reason: 'completed',
  });
});
it.each(['legacy', 'remote'] as const)(
  '%s retains normal observer control',
  async (kind) => {
    const session = makeSession(kind);
    const observed: AgentEvent[] = [];
    session.subscribe((event) => observed.push(event));
    const events = await run(session);
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      reason: 'completed',
    });
    expect(observed.filter((e) => e.type === 'agent_end')).toHaveLength(1);
  },
);
