/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import { CommandService } from './CommandService.js';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});
const command = (name: string): SlashCommand => ({
  name,
  description: name,
  kind: CommandKind.BUILT_IN,
});

it('stops waiting on cancellation even when a loader ignores its signal and never settles', async () => {
  const controller = new AbortController();
  const events = vi.spyOn(coreEvents, 'emitSlashCommandConflicts');
  const logging = vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  const stalled = {
    loadCommands: vi.fn(() => new Promise<SlashCommand[]>(() => {})),
  };
  const loaded = CommandService.create([stalled], controller.signal);
  await vi.waitFor(() => expect(stalled.loadCommands).toHaveBeenCalledOnce());
  let finished = false;
  void loaded.then(() => {
    finished = true;
  });
  controller.abort(new Error('Command reload replaced'));
  await vi.waitFor(() => expect(finished).toBe(true), { timeout: 200 });
  expect((await loaded).getCommands()).toEqual([]);
  expect(events).not.toHaveBeenCalled();
  expect(logging).not.toHaveBeenCalled();
});

it('never starts loaders for an already cancelled command load', async () => {
  const controller = new AbortController();
  controller.abort();
  const loader = { loadCommands: vi.fn(async () => [command('late')]) };
  expect(
    (await CommandService.create([loader], controller.signal)).getCommands(),
  ).toEqual([]);
  expect(loader.loadCommands).not.toHaveBeenCalled();
});

it('isolates a synchronous loader failure while retaining the other loaders in source order', async () => {
  vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  const service = await CommandService.create(
    [
      {
        loadCommands: () => {
          throw new Error('Synchronous loader failure');
        },
      },
      { loadCommands: async () => [command('first')] },
      { loadCommands: async () => [command('second')] },
    ],
    new AbortController().signal,
  );
  expect(service.getCommands().map((item) => item.name)).toEqual([
    'first',
    'second',
  ]);
  expect(debugLogger.debug).toHaveBeenCalledWith(
    'A command loader failed:',
    expect.objectContaining({ message: 'Synchronous loader failure' }),
  );
});

it('observes a late rejected loader without publishing commands, conflicts or a stale failure after cancellation', async () => {
  const controller = new AbortController();
  const events = vi.spyOn(coreEvents, 'emitSlashCommandConflicts');
  const logging = vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  let reject!: (reason: Error) => void;
  const old = CommandService.create(
    [
      {
        loadCommands: () =>
          new Promise<SlashCommand[]>((_resolve, fail) => {
            reject = fail;
          }),
      },
      { loadCommands: async () => [command('old')] },
    ],
    controller.signal,
  );
  await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
  let settled = false;
  void old.then(() => {
    settled = true;
  });
  controller.abort();
  await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 });
  const current = await CommandService.create(
    [{ loadCommands: async () => [command('current')] }],
    new AbortController().signal,
  );
  reject(new Error('Late stale loader failure'));
  await Promise.resolve();
  await Promise.resolve();
  expect(current.getCommands().map((item) => item.name)).toEqual(['current']);
  expect((await old).getCommands()).toEqual([]);
  expect(events).toHaveBeenCalledTimes(1);
  expect(logging).not.toHaveBeenCalled();
});
