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
import { writeDrillGrant } from '../drill/drillGrant.js';
import { I18nManager } from '../i18n/i18nManager.js';
import { AgentTool } from './agent-tool.js';
import { SpawnSubagentsTool } from './spawn-subagents-tool.js';
import { scheduleSubagent } from './subagentScheduler.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { LocalSessionInvocation } from './local-session-invocation.js';
import type { LocalAgentDefinition } from './types.js';
import { AgentRegistry } from './registry.js';

vi.mock('./local-invocation.js');
vi.mock('./local-session-invocation.js');

let root: string;
beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-redteam-entry-'));
  vi.stubEnv('GEMINI_DRILL_DIR', path.join(root, 'drill'));
  vi.stubEnv('GEMINI_ULTRA_RUNTIME_FILE', path.join(root, 'runtime.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  fs.writeFileSync(
    path.join(root, 'runtime.json'),
    JSON.stringify({ collaboration: 'single' }),
  );
  I18nManager.getInstance().setLocale('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
function setup(session = false) {
  const config = makeFakeConfig();
  vi.spyOn(config, 'getSessionId').mockReturnValue(path.basename(root));
  vi.spyOn(config, 'isAgentSessionSubagentEnabled').mockReturnValue(session);
  const definition: LocalAgentDefinition = {
    kind: 'local',
    name: 'redteam-analyst',
    description: 'Read supplied local source',
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
  const bus = createMockMessageBus();
  const tool = new AgentTool(config, bus, undefined, onStart);
  return {
    config,
    bus,
    onStart,
    invocation: tool.build({
      agent_name: 'redteam-analyst',
      prompt: 'Inspect supplied source only',
    }),
  };
}

it.each([false, true])(
  'refuses direct redteam execution without a grant before child creation (session=%s)',
  async (session) => {
    const { invocation, onStart } = setup(session);
    await expect(
      invocation.execute({ abortSignal: new AbortController().signal }),
    ).rejects.toThrow(/authorization/i);
    expect(LocalSubagentInvocation).not.toHaveBeenCalled();
    expect(LocalSessionInvocation).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  },
);

it('refuses ungranted redteam confirmation before constructing a child', async () => {
  const { invocation } = setup();
  await expect(
    invocation.shouldConfirmExecute(new AbortController().signal),
  ).rejects.toThrow(/authorization/i);
  expect(LocalSubagentInvocation).not.toHaveBeenCalled();
});

it('rechecks a queued direct redteam invocation after its grant is revoked and permits explicit retry after restoration', async () => {
  writeDrillGrant(true);
  const { invocation, config, onStart } = setup();
  let release!: () => void;
  let entered!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const occupying = scheduleSubagent(
    config.getSessionId(),
    new AbortController().signal,
    async () => {
      entered();
      await barrier;
    },
  );
  await started;
  const queued = invocation.execute({
    abortSignal: new AbortController().signal,
  });
  const outcome = queued.then(
    () => undefined,
    (error: unknown) => error,
  );
  writeDrillGrant(false);
  release();
  await occupying;
  expect(await outcome).toMatchObject({
    message: expect.stringMatching(/authorization/i),
  });
  expect(LocalSubagentInvocation).not.toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
  writeDrillGrant(true);
  await invocation.execute({ abortSignal: new AbortController().signal });
  expect(LocalSubagentInvocation).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledTimes(1);
});

it('marks an ungranted parallel redteam task failed without launching its child', async () => {
  const { config, bus } = setup();
  const result = await new SpawnSubagentsTool(config, bus)
    .build({
      tasks: [
        {
          agent_name: 'redteam-analyst',
          prompt: 'Inspect supplied local source only',
        },
      ],
    })
    .execute({ abortSignal: new AbortController().signal });
  expect(JSON.stringify(result)).toMatch(/authorization/i);
  expect(JSON.stringify(result)).toContain('FAILED');
  expect(LocalSubagentInvocation).not.toHaveBeenCalled();
});
