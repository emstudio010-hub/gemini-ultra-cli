/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  GenerateContentResponse,
  type GenerateContentParameters,
} from '@google/genai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Config } from '../../config/config.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import { PolicyDecision, InProcessCheckerType } from '../../policy/types.js';
import type { SafetyCheckInput } from '../protocol.js';
import { CheckerRegistry } from '../registry.js';
import { ConsecaSafetyChecker } from './conseca.js';

const configs: Config[] = [];
const policy = (marker: string) => ({
  read_file: { permissions: 'allow', constraints: marker, rationale: marker },
});
function response(value: unknown) {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  });
}
function configure(marker: string, enabled = true) {
  const config = makeFakeConfig({
    enableConseca: enabled,
    question: 'same prompt',
    policyEngineConfig: {
      rules: [{ toolName: 'read_file', decision: PolicyDecision.ALLOW }],
      checkers: [
        {
          toolName: 'read_file',
          checker: { type: 'in-process', name: InProcessCheckerType.CONSECA },
        },
      ],
    },
  });
  configs.push(config);
  // Config is deliberately not initialized in this unit fixture. Supply the
  // empty conversation that ContextBuilder normally reads from a ready chat.
  vi.spyOn(config.getGeminiClient(), 'getHistory').mockReturnValue([]);
  const generate = vi
    .fn()
    .mockImplementation(
      async (_request: GenerateContentParameters, id: string) =>
        response(
          id === 'conseca-policy-enforcement'
            ? { decision: 'allow', reason: marker }
            : {
                policies: [
                  { tool_name: 'read_file', policy: policy(marker).read_file },
                ],
              },
        ),
    );
  vi.spyOn(config, 'getContentGenerator').mockReturnValue({
    generateContent: generate,
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  });
  return { config, generate };
}
beforeEach(() => {
  ConsecaSafetyChecker.resetInstance();
});
afterEach(async () => {
  for (const config of configs.splice(0)) await config.dispose();
  ConsecaSafetyChecker.resetInstance();
  vi.restoreAllMocks();
});

it('keeps the real policy engines on their own Config even after another enabled Config closes', async () => {
  const a = configure('A');
  const b = configure('B');
  const check = (config: Config) =>
    config
      .getPolicyEngine()
      .check({ name: 'read_file', args: { path: 'fixture' } }, undefined);
  await check(a.config);
  await check(b.config);
  expect(a.generate).toHaveBeenCalledTimes(2);
  expect(b.generate).toHaveBeenCalledTimes(2);
  const ca = new CheckerRegistry('.', a.config).resolveInProcess(
    InProcessCheckerType.CONSECA,
  );
  const cb = new CheckerRegistry('.', b.config).resolveInProcess(
    InProcessCheckerType.CONSECA,
  );
  expect(ca).not.toBe(cb);
  expect(ca).toBe(ConsecaSafetyChecker.getInstance(a.config));
  await b.config.dispose();
  await expect(check(a.config)).resolves.toMatchObject({
    decision: PolicyDecision.ALLOW,
  });
  expect(a.generate).toHaveBeenCalledTimes(3);
  expect(b.generate).toHaveBeenCalledTimes(2);
});
it('does not let an enabled Config activate Conseca on a disabled Config', async () => {
  const a = configure('enabled');
  const b = configure('disabled', false);
  await expect(
    b.config.getPolicyEngine().check({ name: 'read_file' }, undefined),
  ).resolves.toMatchObject({ decision: PolicyDecision.ALLOW });
  expect(a.generate).not.toHaveBeenCalled();
  expect(b.generate).not.toHaveBeenCalled();
});
it('invalidates a policy cache when trusted tool content changes and still reuses an exact match', async () => {
  const { config, generate } = configure('tools');
  const checker = ConsecaSafetyChecker.getInstance(config);
  await checker.getPolicy('same prompt', 'read-only schema', config);
  await checker.getPolicy('same prompt', 'new tool schema', config);
  await checker.getPolicy('same prompt', 'new tool schema', config);
  expect(generate).toHaveBeenCalledTimes(2);
});
it('does not reuse the standalone cache for a different explicit Config', async () => {
  const a = configure('A');
  const b = configure('B');
  const checker = ConsecaSafetyChecker.getInstance();
  await checker.getPolicy('same prompt', 'same tools', a.config);
  await expect(
    checker.getPolicy('same prompt', 'same tools', b.config),
  ).resolves.toEqual(policy('B'));
  expect(b.generate).toHaveBeenCalledTimes(1);
});
it('does not publish an old pending policy into a newly assigned standalone context', async () => {
  const a = configure('A');
  const b = configure('B');
  const checker = ConsecaSafetyChecker.getInstance();
  let release!: (value: GenerateContentResponse) => void;
  const held = new Promise<GenerateContentResponse>((resolve) => {
    release = resolve;
  });
  a.generate.mockReturnValueOnce(held);
  checker.setContext(a.config);
  const pending = checker.getPolicy('same prompt', 'same tools', a.config);
  await vi.waitFor(() => expect(a.generate).toHaveBeenCalledTimes(1));
  checker.setContext(b.config);
  await checker.getPolicy('same prompt', 'same tools', b.config);
  release(
    response({
      policies: [{ tool_name: 'read_file', policy: policy('A').read_file }],
    }),
  );
  await expect(pending).resolves.toEqual(policy('A'));
  expect(checker.getCurrentPolicy()).toEqual(policy('B'));
  await checker.getPolicy('same prompt', 'same tools', b.config);
  expect(b.generate).toHaveBeenCalledTimes(1);
});
it('enforces the policy returned to that check even if another check updates the cache before it resumes', async () => {
  const { config, generate } = configure('OWN_POLICY_MARKER');
  const checker = ConsecaSafetyChecker.getInstance(config);
  const original = checker.getPolicy.bind(checker);
  vi.spyOn(checker, 'getPolicy').mockImplementationOnce(async (...args) => {
    const own = await original(...args);
    generate.mockResolvedValueOnce(
      response({
        policies: [
          {
            tool_name: 'read_file',
            policy: policy('OTHER_POLICY_MARKER').read_file,
          },
        ],
      }),
    );
    await original('concurrent prompt', 'other tools', config);
    return own;
  });
  const input: SafetyCheckInput = {
    protocolVersion: '1.0.0',
    toolCall: { name: 'read_file' },
    context: {
      environment: { cwd: '/', workspaces: [] },
      history: { turns: [{ user: { text: 'own prompt' }, model: {} }] },
    },
  };
  await checker.check(input);
  const last = generate.mock.calls.at(-1)!;
  expect(last[1]).toBe('conseca-policy-enforcement');
  expect(JSON.stringify(last[0].contents)).toContain('OWN_POLICY_MARKER');
  expect(JSON.stringify(last[0].contents)).not.toContain('OTHER_POLICY_MARKER');
  expect(checker.getCurrentPolicy()).toEqual(policy('OTHER_POLICY_MARKER'));
});
