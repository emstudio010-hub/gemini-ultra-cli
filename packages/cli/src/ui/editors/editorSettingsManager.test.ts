/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, expect, it, vi } from 'vitest';
const { check, allowed } = vi.hoisted(() => ({
  check: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock('@google/gemini-cli-core', () => ({
  hasValidEditorCommandAsync: check,
  allowEditorTypeInSandbox: allowed,
  EDITOR_DISPLAY_NAMES: {
    vscode: 'VS Code',
    vim: 'Vim',
    zed: 'Zed',
    micro: 'Micro',
  },
}));
import { editorSettingsManager } from './editorSettingsManager.js';

beforeEach(() => {
  check.mockReset();
  allowed.mockReset().mockReturnValue(true);
});

it('does no eager probing, keeps sorted installation and sandbox labels, and refreshes on reopen', async () => {
  expect(check).not.toHaveBeenCalled();
  check.mockImplementation(async (type) => type !== 'zed');
  allowed.mockImplementation((type) => type !== 'vscode');
  const list = await editorSettingsManager.getAvailableEditorDisplays();
  expect(list).toEqual([
    { name: 'None', type: 'not_set', disabled: false },
    { name: 'Micro', type: 'micro', disabled: false },
    { name: 'Vim', type: 'vim', disabled: false },
    {
      name: 'VS Code (Not available in sandbox)',
      type: 'vscode',
      disabled: true,
    },
    { name: 'Zed (Not installed)', type: 'zed', disabled: true },
  ]);
  check.mockResolvedValue(true);
  expect(
    (await editorSettingsManager.getAvailableEditorDisplays()).at(-1)?.disabled,
  ).toBe(false);
});

it('limits concurrent probes and stops later groups when the dialog closes', async () => {
  const controller = new AbortController();
  const release: Array<() => void> = [];
  check.mockImplementation((_type, signal) => {
    expect(signal).toBe(controller.signal);
    return new Promise<boolean>((resolve) =>
      release.push(() => resolve(false)),
    );
  });
  const pending = editorSettingsManager.getAvailableEditorDisplays(
    controller.signal,
  );
  expect(check).toHaveBeenCalledTimes(3);
  controller.abort();
  release.forEach((resolve) => resolve());
  await expect(pending).rejects.toThrow();
  expect(check).toHaveBeenCalledTimes(3);
});
