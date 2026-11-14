/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { ApprovalMode } from '../policy/types.js';
import { I18nManager } from '../i18n/i18nManager.js';
import { AgentTool } from './agent-tool.js';
import { AgentRegistry } from './registry.js';
import { scheduleSubagent } from './subagentScheduler.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { LocalSessionInvocation } from './local-session-invocation.js';
import type { LocalAgentDefinition } from './types.js';

vi.mock('./local-invocation.js');
vi.mock('./local-session-invocation.js');
let root: string;
beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-agent-plan-'));
  vi.stubEnv('GEMINI_ULTRA_RUNTIME_FILE', path.join(root, 'runtime.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  fs.writeFileSync(
    path.join(root, 'runtime.json'),
    '{"collaboration":"single"}',
  );
  I18nManager.getInstance().setLocale('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
function setup(name = 'coder', session = false) {
  const config = makeFakeConfig();
  vi.spyOn(config, 'getSessionId').mockReturnValue(path.basename(root));
  vi.spyOn(config, 'isAgentSessionSubagentEnabled').mockReturnValue(session);
  const mode = vi
    .spyOn(config, 'getApprovalMode')
    .mockReturnValue(ApprovalMode.DEFAULT);
  const definition: LocalAgentDefinition = {
    kind: 'local',
    name,
    description: 'Scoped native agent',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
      },
    },
    modelConfig: { model: 'fixture', generateContentConfig: {} },
    runConfig: { maxTimeMinutes: 1 },
    promptConfig: { systemPrompt: 'Use assigned scope' },
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
  ).build({ agent_name: name, prompt: 'Inspect assigned source' });
  return { config, mode, onStart, invocation };
}

it.each([false, true])(
  'rechecks a queued native role after entering Plan Mode and permits explicit retry (session=%s)',
  async (session) => {
    const { config, mode, onStart, invocation } = setup('coder', session);
    let release!: () => void;
    let enter!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const occupying = scheduleSubagent(
      config.getSessionId(),
      new AbortController().signal,
      async () => {
        enter();
        await barrier;
      },
    );
    await entered;
    const outcome = invocation
      .execute({ abortSignal: new AbortController().signal })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    mode.mockReturnValue(ApprovalMode.PLAN);
    release();
    await occupying;
    expect(await outcome).toMatchObject({
      message: expect.stringContaining('Plan Mode'),
    });
    expect(LocalSubagentInvocation).not.toHaveBeenCalled();
    expect(LocalSessionInvocation).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    mode.mockReturnValue(ApprovalMode.DEFAULT);
    await invocation.execute({ abortSignal: new AbortController().signal });
    expect(
      session ? LocalSessionInvocation : LocalSubagentInvocation,
    ).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  },
);

it('rejects native workflow roles before confirmation or execution while already in Plan Mode', async () => {
  for (const name of ['researcher', 'coder', 'workflow-auditor']) {
    const { mode, invocation, onStart } = setup(name);
    mode.mockReturnValue(ApprovalMode.PLAN);
    await expect(
      invocation.shouldConfirmExecute(new AbortController().signal),
    ).rejects.toThrow('Plan Mode');
    await expect(
      invocation.execute({ abortSignal: new AbortController().signal }),
    ).rejects.toThrow('Plan Mode');
    expect(onStart).not.toHaveBeenCalled();
  }
  expect(LocalSubagentInvocation).not.toHaveBeenCalled();
});

it.each(['codebase_investigator', 'cli_help', 'custom-reader'])(
  'preserves the existing policy path for %s in Plan Mode',
  async (name) => {
    const { mode, invocation, onStart } = setup(name);
    mode.mockReturnValue(ApprovalMode.PLAN);
    await invocation.execute({ abortSignal: new AbortController().signal });
    expect(LocalSubagentInvocation).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  },
);
