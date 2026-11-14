/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import type { ExtensionManager } from './extension-manager.js';
import { loadExtensionsForStartup } from './config.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('returns loaded extensions before the startup deadline', async () => {
  const extensions = [{ name: 'fixture' }] as unknown as GeminiCLIExtension[];
  const manager = {
    loadExtensions: vi.fn().mockResolvedValue(extensions),
  } as unknown as ExtensionManager;
  await expect(loadExtensionsForStartup(manager, 5000)).resolves.toBe(
    extensions,
  );
  expect(manager.loadExtensions).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('falls back after a stalled extension discovery and observes the late rejection', async () => {
  let reject!: (error: Error) => void;
  const loading = new Promise<GeminiCLIExtension[]>((_resolve, fail) => {
    reject = fail;
  });
  const manager = {
    loadExtensions: vi.fn().mockReturnValue(loading),
  } as unknown as ExtensionManager;
  const pending = loadExtensionsForStartup(manager, 5000);
  await vi.advanceTimersByTimeAsync(5000);
  await expect(pending).resolves.toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  reject(new Error('late extension failure'));
  await Promise.resolve();
  expect(manager.loadExtensions).toHaveBeenCalledTimes(1);
});
it('does not turn an ordinary extension error into a timeout fallback', async () => {
  const error = new Error('invalid extension manifest');
  const manager = {
    loadExtensions: vi.fn().mockRejectedValue(error),
  } as unknown as ExtensionManager;
  await expect(loadExtensionsForStartup(manager, 5000)).rejects.toBe(error);
});
