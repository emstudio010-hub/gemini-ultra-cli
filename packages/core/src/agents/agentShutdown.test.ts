/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import { AgentTool } from './agent-tool.js';
import { AgentRegistry } from './registry.js';
import { scheduleSubagent } from './subagentScheduler.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { LocalSessionInvocation } from './local-session-invocation.js';
import type { LocalAgentDefinition } from './types.js';

vi.mock('./local-invocation.js');
vi.mock('./local-session-invocation.js');
let root: string;
let configs: Config[];
beforeEach(() => {
  vi.clearAllMocks();
  configs = [];
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-agent-shutdown-'));
  vi.stubEnv('GEMINI_ULTRA_RUNTIME_FILE', path.join(root, 'runtime.json'));
  fs.writeFileSync(
    path.join(root, 'runtime.json'),
    '{"collaboration":"single"}',
  );
});
afterEach(async () => {
  for (const config of configs) await config.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
function setup(session = false) {
  const config = makeFakeConfig();
  configs.push(config);
  vi.spyOn(config, 'getSessionId').mockReturnValue(path.basename(root));
  vi.spyOn(config, 'isAgentSessionSubagentEnabled').mockReturnValue(session);
  const definition: LocalAgentDefinition = {
    kind: 'local',
    name: 'researcher',
    description: 'Read local scope',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
      },
    },
    modelConfig: { model: 'fixture', generateContentConfig: {} },
    runConfig: { maxTimeMinutes: 1 },
    promptConfig: { systemPrompt: 'Read only' },
  };
  const registry = new AgentRegistry(config);
  vi.spyOn(registry, 'getDefinition').mockReturnValue(definition);
  vi.spyOn(config, 'getAgentRegistry').mockReturnValue(registry);
  const onStart = vi.fn();
  const invocation = new AgentTool(
    config,
    createMockMessageBus(),
    undefined,
    onStart,
  ).build({ agent_name: 'researcher', prompt: 'Read the supplied fixture' });
  return { config, invocation, onStart };
}
it('removes a queued delegation on Config disposal before the active slot is released', async () => {
  const { config, invocation, onStart } = setup();
  let release!: () => void;
  let enter!: () => void;
  const started = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const occupying = scheduleSubagent(
    config.getSessionId(),
    new AbortController().signal,
    async () => {
      enter();
      await gate;
    },
  );
  await started;
  let error: unknown;
  const queued = invocation
    .execute({ abortSignal: new AbortController().signal })
    .catch((failure) => {
      error = failure;
    });
  try {
    await config.dispose();
    await vi.waitFor(
      () =>
        expect(error).toMatchObject({
          name: 'AbortError',
          message: 'Configuration disposed.',
        }),
      { timeout: 200 },
    );
    expect(LocalSubagentInvocation).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  } finally {
    release();
    await occupying;
    await queued;
  }
});
it.each([false, true])(
  'passes Config shutdown to active children and holds the slot until cleanup settles (session=%s)',
  async (session) => {
    const child = session ? LocalSessionInvocation : LocalSubagentInvocation;
    let enter!: () => void;
    let release!: () => void;
    let received: AbortSignal | undefined;
    const started = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(child.prototype.execute).mockImplementationOnce(
      async (options) => {
        received = options.abortSignal;
        enter();
        await gate;
        return {
          llmContent: 'UNACCEPTED_LATE_SUCCESS',
          returnDisplay: 'Late result',
        };
      },
    );
    const { config, invocation } = setup(session);
    const caller = new AbortController();
    let settled = false;
    const pending = invocation.execute({ abortSignal: caller.signal }).then(
      (value) => {
        settled = true;
        return value;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await started;
    let nextStarted = false;
    const next = scheduleSubagent(
      config.getSessionId(),
      new AbortController().signal,
      async () => {
        nextStarted = true;
      },
    );
    try {
      await config.dispose();
      expect(received?.aborted).toBe(true);
      expect(caller.signal.aborted).toBe(false);
      expect(settled).toBe(false);
      expect(nextStarted).toBe(false);
    } finally {
      release();
    }
    expect(await pending).toMatchObject({
      name: 'AbortError',
      message: 'Configuration disposed.',
    });
    await next;
    expect(nextStarted).toBe(true);
  },
);
it('refuses confirmation and new execution after Config disposal before building a child', async () => {
  const { config, invocation, onStart } = setup();
  await config.dispose();
  await expect(
    invocation.shouldConfirmExecute(new AbortController().signal),
  ).rejects.toMatchObject({
    name: 'AbortError',
    message: 'Configuration disposed.',
  });
  await expect(
    invocation.execute({ abortSignal: new AbortController().signal }),
  ).rejects.toMatchObject({
    name: 'AbortError',
    message: 'Configuration disposed.',
  });
  expect(LocalSubagentInvocation).not.toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
});
it('stops waiting for a child confirmation on disposal even if it returns late', async () => {
  let release!: () => void;
  let enter!: () => void;
  const started = new Promise<void>((resolve) => {
    enter = resolve;
  });
  vi.mocked(
    LocalSubagentInvocation.prototype.shouldConfirmExecute,
  ).mockImplementationOnce(() => {
    enter();
    return new Promise((resolve) => {
      release = () => resolve(false);
    });
  });
  const { config, invocation } = setup();
  let error: unknown;
  const pending = invocation
    .shouldConfirmExecute(new AbortController().signal)
    .catch((failure) => {
      error = failure;
    });
  try {
    await started;
    await config.dispose();
    await vi.waitFor(
      () =>
        expect(error).toMatchObject({
          name: 'AbortError',
          message: 'Configuration disposed.',
        }),
      { timeout: 200 },
    );
  } finally {
    release();
    await pending;
  }
  expect(LocalSubagentInvocation.prototype.execute).not.toHaveBeenCalled();
});
