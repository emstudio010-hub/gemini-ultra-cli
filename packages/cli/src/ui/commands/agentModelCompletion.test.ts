/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AuthType,
  ProviderManager,
  createSwarm,
  type Config,
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  boostCommand,
  teamworkCommand,
  grillMeCommand,
} from './agentWorkflowCommands.js';
import { swarmCommand } from './swarmCommand.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-model-completion-'));
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
  ProviderManager.getInstance().upsertProvider({
    name: 'local',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'fixture-secret',
    models: ['model-v1'],
  });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  ProviderManager.resetInstance();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([teamworkCommand, boostCommand, swarmCommand])(
  'offers local role and model completions through $name without dispatch or configuration changes',
  async (command) => {
    const auth = vi.fn(() => ({ authType: AuthType.GATEWAY }));
    const config = {
      storage: { getProjectTempDir: () => root },
      getContentGeneratorConfig: auth,
      getModel: () => 'gemini-fixture',
    } as unknown as Config;
    const context = createMockCommandContext({
      services: { agentContext: { config } },
    });
    const completion = command.subCommands!.find(
      (item) => item.name === 'model',
    )!.completion!;
    const providerFile = path.join(root, 'providers.json');
    const beforeProviders = fs.readFileSync(providerFile);
    let memberFile: string | undefined;
    let beforeMember: Buffer | undefined;
    if (command === swarmCommand) {
      const saved = createSwarm(root, 'Choose a member locally');
      memberFile = path.join(root, 'swarms', saved.id, 'members.json');
      fs.writeFileSync(
        memberFile,
        JSON.stringify({
          ...saved,
          members: [
            {
              name: 'reader',
              agent: 'researcher',
              brief: 'Read the assigned source',
              state: 'waiting',
            },
          ],
        }),
      );
      beforeMember = fs.readFileSync(memberFile);
      expect(await completion(context, '@r')).toEqual(['@reader']);
      expect(await completion(context, '@reader in')).toEqual([
        '@reader inherit',
      ]);
      expect(await completion(context, 'red')).toEqual(['redteam-analyst']);
    }
    expect(await completion(context, 'rese')).toEqual(['researcher']);
    expect(await completion(context, 'researcher ')).toEqual([
      'researcher inherit',
      'researcher local:model-v1',
    ]);
    expect(await completion(context, 'researcher local:m')).toEqual([
      'researcher local:model-v1',
    ]);
    expect(await completion(context, 'researcher native:')).toEqual([]);
    expect(await completion(context, 'unknown local:')).toEqual([]);
    expect(
      await completion(context, 'researcher local:model-v1 extra'),
    ).toEqual([]);
    auth.mockReturnValue({ authType: AuthType.USE_GEMINI });
    expect(await completion(context, 'researcher native:')).toEqual([
      'researcher native:gemini-fixture',
    ]);
    expect(fs.readFileSync(providerFile).equals(beforeProviders)).toBe(true);
    if (memberFile)
      expect(fs.readFileSync(memberFile).equals(beforeMember!)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(context.ui.addItem).not.toHaveBeenCalled();
    expect(
      grillMeCommand.subCommands!.some((item) => item.name === 'model'),
    ).toBe(false);
  },
);
