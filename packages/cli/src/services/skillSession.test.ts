/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AuthType,
  I18nManager,
  ProviderManager,
  type Config,
  type SkillDefinition,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../test-utils/mockConfig.js';
import { startSkillSession } from './skillSession.js';
let root: string;
let config: Config;
let skill: SkillDefinition;
const addHistory = vi.fn();
const activateSkill = vi.fn();
const setModel = vi.fn();
const addDirectory = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-skill-session-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  ProviderManager.resetInstance();
  I18nManager.getInstance().setLocale('en');
  const manager = ProviderManager.getInstance();
  manager.upsertProvider({
    name: 'local',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: '',
    models: ['fixture'],
    setActive: true,
  });
  manager.setReasoningEffort('max');
  skill = {
    name: 'fixture',
    description: 'Fixture',
    location: path.join(root, 'SKILL.md'),
    body: 'EXACT_SKILL_BODY\nKeep all instructions.',
  };
  config = createMockConfig({
    isSkillsSupportEnabled: () => true,
    getModel: () => 'local:fixture',
    getContentGeneratorConfig: () => ({ authType: AuthType.GATEWAY }),
    setModel,
    getSkillManager: () =>
      ({
        getSkill: () => skill,
        isAdminEnabled: () => true,
        activateSkill,
      }) as unknown as ReturnType<Config['getSkillManager']>,
    getGeminiClient: () =>
      ({ isInitialized: () => true, addHistory }) as unknown as ReturnType<
        Config['getGeminiClient']
      >,
    getWorkspaceContext: () =>
      ({ addDirectory }) as unknown as ReturnType<
        Config['getWorkspaceContext']
      >,
  });
});
afterEach(() => {
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it('delivers exact instructions and resources before marking active, keeping model selection temporary', async () => {
  await startSkillSession(config, 'fixture', 'local:fixture', 'ultra');
  const content = addHistory.mock.calls[0][0];
  expect(content.role).toBe('user');
  expect(content.parts[0].text).toContain(skill.body);
  expect(content.parts[0].text).toContain(JSON.stringify(skill.location));
  expect(addDirectory).toHaveBeenCalledWith(root);
  expect(setModel).toHaveBeenCalledWith('local:fixture', true);
  expect(activateSkill).toHaveBeenCalledWith('fixture');
  expect(addHistory.mock.invocationCallOrder[0]).toBeLessThan(
    activateSkill.mock.invocationCallOrder[0],
  );
  expect(ProviderManager.getInstance().getReasoningEffort()).toBe('ultra');
  expect(ProviderManager.getInstance().getActiveProvider()?.id).toBe('local');
});
it.each(['unavailable-model', 'disabled-skill', 'effort-conflict'])(
  'rejects %s before injecting, switching model or activating',
  async (reason) => {
    if (reason === 'disabled-skill') skill.disabled = true;
    if (reason === 'effort-conflict')
      new ProviderManager(path.join(root, 'providers.json')).setReasoningEffort(
        'low',
      );
    const before = fs.readFileSync(path.join(root, 'providers.json'));
    await expect(
      startSkillSession(
        config,
        'fixture',
        reason === 'unavailable-model' ? 'gemini-2.5-pro' : 'local:fixture',
        'ultra',
      ),
    ).rejects.toThrow();
    expect(
      fs.readFileSync(path.join(root, 'providers.json')).equals(before),
    ).toBe(true);
    expect(addHistory).not.toHaveBeenCalled();
    expect(setModel).not.toHaveBeenCalled();
    expect(activateSkill).not.toHaveBeenCalled();
  },
);
it('reports history delivery failure without marking active or claiming effort was rolled back', async () => {
  addHistory.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));
  await expect(
    startSkillSession(config, 'fixture', 'local:fixture', 'ultra'),
  ).rejects.toThrow('Reasoning effort may already be saved');
  expect(activateSkill).not.toHaveBeenCalled();
  expect(setModel).not.toHaveBeenCalled();
  expect(ProviderManager.getInstance().getReasoningEffort()).toBe('ultra');
});
