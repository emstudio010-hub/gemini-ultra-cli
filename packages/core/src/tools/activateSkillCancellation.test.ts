/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ActivateSkillTool } from './activate-skill.js';
import { ToolConfirmationOutcome } from './tools.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import type { SkillDefinition } from '../skills/skillLoader.js';
vi.mock('../utils/getFolderStructure.js', () => ({
  getFolderStructure: vi.fn(),
}));
let root: string;
let skill: SkillDefinition;
let config: Config;
const activate = vi.fn();
const addDirectory = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFolderStructure).mockResolvedValue('Fixture resources');
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-skill-cancellation-'));
  vi.stubEnv(
    'GEMINI_ULTRA_SKILL_LIBRARY_FILE',
    path.join(root, 'metadata.json'),
  );
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  skill = {
    name: 'fixture',
    description: 'Fixture',
    body: 'EXACT_CANCELLATION_SKILL_BODY',
    location: path.join(root, 'SKILL.md'),
  };
  config = {
    getSkillManager: () => ({
      getSkills: () => [skill],
      getSkill: () => skill,
      activateSkill: activate,
    }),
    getWorkspaceContext: () => ({ addDirectory }),
  } as unknown as Config;
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
const build = () =>
  new ActivateSkillTool(config, createMockMessageBus()).build({
    name: 'fixture',
  });
it('rejects a pre-cancelled execution before reading or publishing active state', async () => {
  const reason = new Error('cancel before activation');
  await expect(
    build().execute({ abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(getFolderStructure).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  expect(addDirectory).not.toHaveBeenCalled();
});
it('does not mark active or extend resource access when folder preparation fails', async () => {
  const error = new Error('resource read failed');
  vi.mocked(getFolderStructure).mockRejectedValueOnce(error);
  await expect(
    build().execute({ abortSignal: new AbortController().signal }),
  ).rejects.toBe(error);
  expect(activate).not.toHaveBeenCalled();
  expect(addDirectory).not.toHaveBeenCalled();
});
it('rejects cancelled preparation promptly and ignores late resource results', async () => {
  let finish!: (value: string) => void;
  vi.mocked(getFolderStructure).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const reason = new Error('stop pending resources');
  let observed: unknown;
  const pending = build()
    .execute({ abortSignal: controller.signal })
    .then(
      (value) => {
        observed = { value };
      },
      (error: unknown) => {
        observed = { error };
      },
    );
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(reason);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const afterCancel = observed;
  finish('LATE_RESOURCE_MARKER');
  await pending;
  expect(afterCancel).toEqual({ error: reason });
  expect(activate).not.toHaveBeenCalled();
  expect(addDirectory).not.toHaveBeenCalled();
});
it('does not persist tags or policy after the confirmation request is cancelled', async () => {
  const controller = new AbortController();
  const reason = new Error('cancel confirmation');
  const bus = createMockMessageBus();
  const call = new ActivateSkillTool(config, bus).build({ name: 'fixture' });
  const details = await call.shouldConfirmExecute(
    controller.signal,
    'ask_user',
  );
  expect(details).not.toBe(false);
  controller.abort(reason);
  if (details)
    await expect(
      details.onConfirm(ToolConfirmationOutcome.ProceedAlways),
    ).rejects.toBe(reason);
  expect(fs.existsSync(path.join(root, 'metadata.json'))).toBe(false);
  expect(bus.publish).not.toHaveBeenCalled();
});
it('does not activate a skill disabled after the invocation was created', async () => {
  const call = build();
  skill.disabled = true;
  const result = await call.execute({
    abortSignal: new AbortController().signal,
  });
  expect(result.error).toBeDefined();
  expect(activate).not.toHaveBeenCalled();
  expect(addDirectory).not.toHaveBeenCalled();
});

it('rejects a skill body changed after the user saw the confirmation', async () => {
  const call = build();
  const details = await call.shouldConfirmExecute(
    new AbortController().signal,
    'ask_user',
  );
  skill.body = 'REPLACEMENT_BODY';
  if (!details) throw new Error('Expected confirmation');
  await expect(
    details.onConfirm(ToolConfirmationOutcome.ProceedOnce),
  ).rejects.toThrow();
  expect(activate).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(root, 'metadata.json'))).toBe(false);
});
