/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Server, RequestListener } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';
const owned = vi.hoisted(() => [] as Server[]);
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: (listener?: RequestListener) => {
      const server = actual.createServer(listener);
      owned.push(server);
      return server;
    },
  };
});
let disconnect: () => void;
beforeEach(() => {
  disconnect = connectDrillSession({
    config: {} as Config,
    isReady: () => true,
    submit: async () => {
      throw Error('No dispatch');
    },
  });
});
afterEach(async () => {
  disconnect();
  stopDrillCockpit();
  for (const server of owned.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
it('rejects a stopped pending startup and leaves no listener behind', async () => {
  const pending = startDrillCockpit().then(
    (url) => ({ url }),
    (error: unknown) => ({ error }),
  );
  stopDrillCockpit();
  const result = await pending;
  await tick();
  expect(result).toHaveProperty('error');
  expect(owned.every((server) => !server.listening)).toBe(true);
});
it('starts a fresh service after stopping an unfinished startup', async () => {
  const old = startDrillCockpit().then(
    (url) => ({ url }),
    (error: unknown) => ({ error }),
  );
  stopDrillCockpit();
  const fresh = startDrillCockpit();
  const oldResult = await old;
  const url = new URL(await fresh);
  expect(oldResult).toHaveProperty('error');
  expect(url.hash.slice(1)).toMatch(/^[a-f0-9]{64}$/);
  expect(owned).toHaveLength(2);
  expect(owned[0].listening).toBe(false);
  expect(owned[1].listening).toBe(true);
  expect(await startDrillCockpit()).toBe(url.href);
});
it('coalesces concurrent normal starts and creates a new identity only after stop', async () => {
  const [first, second] = await Promise.all([
    startDrillCockpit(),
    startDrillCockpit(),
  ]);
  expect(first).toBe(second);
  expect(owned).toHaveLength(1);
  stopDrillCockpit();
  const next = await startDrillCockpit();
  expect(next).not.toBe(first);
  expect(owned).toHaveLength(2);
  expect(owned[1].listening).toBe(true);
});
