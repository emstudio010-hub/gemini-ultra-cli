/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActivateSkillTool } from './activate-skill.js';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
} from './tools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import {
  registerSkillInLibrary,
  loadSkillLibraryRegistry,
} from '../skills/skillOrchestrator.js';
vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});
vi.mock('../utils/getFolderStructure.js', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Fixture resources'),
}));
let root: string;
let file: string;
let config: Config;
let activate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-activate-library-'));
  vi.mocked(os.homedir).mockReturnValue(root);
  file = path.join(root, '.gemini/config/skill-tags.json');
  vi.stubEnv('GEMINI_ULTRA_SKILL_LIBRARY_FILE', file);
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  const skill = {
    name: 'fixture',
    description: 'Fixture skill',
    body: 'EXACT_LIBRARY_SKILL_BODY',
    location: path.join(root, 'SKILL.md'),
  };
  activate = vi.fn();
  config = {
    getSkillManager: () => ({
      getSkills: () => [skill],
      getSkill: () => skill,
      activateSkill: activate,
    }),
    getWorkspaceContext: () => ({ addDirectory: vi.fn() }),
  } as unknown as Config;
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
const invocation = () =>
  new ActivateSkillTool(config, createMockMessageBus()).build({
    name: 'fixture',
  });
const confirmation = (call: ReturnType<typeof invocation>) =>
  (
    call as unknown as {
      getConfirmationDetails: (
        signal: AbortSignal,
      ) => Promise<ToolCallConfirmationDetails>;
    }
  ).getConfirmationDetails(new AbortController().signal);
it('allows a skill once without creating persistent metadata', async () => {
  const call = invocation();
  const details = await confirmation(call);
  await details.onConfirm(ToolConfirmationOutcome.ProceedOnce);
  const result = await call.execute({
    abortSignal: new AbortController().signal,
  });
  expect(result.llmContent).toContain('EXACT_LIBRARY_SKILL_BODY');
  expect(fs.existsSync(file)).toBe(false);
  expect(activate).toHaveBeenCalledWith('fixture');
});

it('allows once with damaged optional metadata while retaining its bytes and the skill body', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{DAMAGED');
  const call = invocation();
  const details = await confirmation(call);
  expect(details).toHaveProperty('prompt');
  await details.onConfirm(ToolConfirmationOutcome.ProceedOnce);
  const result = await call.execute({
    abortSignal: new AbortController().signal,
  });
  expect(result.llmContent).toContain('EXACT_LIBRARY_SKILL_BODY');
  expect(fs.readFileSync(file, 'utf8')).toBe('{DAMAGED');
  expect(activate).toHaveBeenCalledOnce();
});

it('does not publish permanent policy when damaged metadata cannot be saved', async () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{DAMAGED');
  const bus = createMockMessageBus();
  const call = new ActivateSkillTool(config, bus).build({ name: 'fixture' });
  const details = await confirmation(call);
  await expect(
    details.onConfirm(ToolConfirmationOutcome.ProceedAlways),
  ).rejects.toThrow();
  expect(bus.publish).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  expect(fs.readFileSync(file, 'utf8')).toBe('{DAMAGED');
});

it('saves only explicit permanent choices and retains other registered skills', async () => {
  registerSkillInLibrary({
    name: 'existing',
    domain: 'specialized-domain',
    badge: 'Existing',
    tags: ['#existing'],
    mode: 'tagged',
  });
  const before = fs.readFileSync(file);
  const call = invocation();
  const details = await confirmation(call);
  await details.onConfirm(ToolConfirmationOutcome.ProceedAlwaysAndSave);
  expect(Object.keys(loadSkillLibraryRegistry()).sort()).toEqual([
    'existing',
    'fixture',
  ]);
  expect(
    fs
      .readdirSync(path.dirname(file))
      .filter((name) => name.endsWith('.bak'))
      .some((name) =>
        fs.readFileSync(path.join(path.dirname(file), name)).equals(before),
      ),
  ).toBe(true);
});
