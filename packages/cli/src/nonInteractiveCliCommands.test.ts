/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it, vi } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import { CommandService } from './services/CommandService.js';
vi.mock('./services/CommandService.js', () => ({
  CommandService: {
    create: vi.fn().mockResolvedValue({ getCommands: () => [] }),
  },
}));
vi.mock('./services/BuiltinCommandLoader.js', () => ({
  BuiltinCommandLoader: vi.fn(),
}));
vi.mock('./services/FileCommandLoader.js', () => ({
  FileCommandLoader: vi.fn(),
}));
vi.mock('./services/McpPromptLoader.js', () => ({ McpPromptLoader: vi.fn() }));
it('rejects an unavailable provider credential command before headless model fallback', async () => {
  const config = {} as Config;
  const settings = {} as LoadedSettings;
  const raw =
    '/Provider add Fixture https://fixture.invalid FAKE_PROVIDER_KEY_DO_NOT_USE fixture-model';
  await expect(
    handleSlashCommand(raw, new AbortController(), config, settings),
  ).rejects.toThrow('/provider');
  await expect(
    handleSlashCommand(
      '/home/user/file.txt',
      new AbortController(),
      config,
      settings,
    ),
  ).resolves.toBeUndefined();
});

it('does not load commands for cancelled noninteractive input', async () => {
  const controller = new AbortController();
  const reason = new Error('Cancelled noninteractive input');
  controller.abort(reason);
  const before = vi.mocked(CommandService.create).mock.calls.length;
  await expect(
    handleSlashCommand(
      '/stats',
      controller,
      {} as Config,
      {} as LoadedSettings,
    ),
  ).rejects.toBe(reason);
  expect(vi.mocked(CommandService.create).mock.calls.length).toBe(before);
});

it('rejects cancellation during loading before invoking any resolved command or fallback', async () => {
  const controller = new AbortController();
  const reason = new Error('Cancelled command loading');
  const action = vi.fn();
  vi.mocked(CommandService.create).mockImplementationOnce(async () => {
    controller.abort(reason);
    return {
      getCommands: () => [{ name: 'stats', action }],
    } as unknown as CommandService;
  });
  await expect(
    handleSlashCommand(
      '/stats',
      controller,
      {} as Config,
      {} as LoadedSettings,
    ),
  ).rejects.toBe(reason);
  expect(action).not.toHaveBeenCalled();
});
