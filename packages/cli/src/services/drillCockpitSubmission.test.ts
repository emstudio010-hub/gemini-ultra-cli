/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { coreEvents, type Config } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';
let disconnect: (() => void) | undefined;
const releases: Array<() => void> = [];
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await new Promise((resolve) => setImmediate(resolve));
  disconnect?.();
  disconnect = undefined;
  stopDrillCockpit();
  vi.restoreAllMocks();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releases.push(resolve);
  return { promise, resolve };
}
async function client() {
  const url = new URL(await startDrillCockpit());
  return () =>
    new Promise<number>((resolve, reject) => {
      const request = http.request(
        url.origin + '/api/prompt',
        {
          method: 'POST',
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'X-Drill-Token': url.hash.slice(1),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 500));
          res.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end('{"prompt":"Fixture"}');
    });
}
it('does not let an old Config task block or unlock the new Config task', async () => {
  const old = deferred();
  const next = deferred();
  const config = {} as Config;
  const current = {} as Config;
  const submit = vi.fn(() => next.promise);
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: () => old.promise,
  });
  const post = await client();
  expect(await post()).toBe(202);
  disconnect = connectDrillSession({
    config: current,
    isReady: () => true,
    submit,
  });
  expect(await post()).toBe(202);
  old.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  expect(await post()).toBe(409);
  expect(submit).toHaveBeenCalledOnce();
  next.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  expect(await post()).toBe(202);
});
it('retains the same Config lock across view reconnects until the task settles', async () => {
  const task = deferred();
  const config = {} as Config;
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: () => task.promise,
  });
  const post = await client();
  expect(await post()).toBe(202);
  const latest = vi.fn(async () => {});
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: latest,
  });
  expect(await post()).toBe(409);
  expect(latest).not.toHaveBeenCalled();
  task.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  expect(await post()).toBe(202);
  expect(latest).toHaveBeenCalledOnce();
});
it('releases the same Config lock after asynchronous submission failure', async () => {
  const feedback = vi
    .spyOn(coreEvents, 'emitFeedback')
    .mockImplementation(() => {});
  const config = {} as Config;
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: async () => {
      throw Error('Fixture failure');
    },
  });
  const post = await client();
  expect(await post()).toBe(202);
  const submit = vi.fn(async () => {});
  disconnect = connectDrillSession({ config, isReady: () => true, submit });
  expect(await post()).toBe(202);
  expect(submit).toHaveBeenCalledOnce();
  expect(feedback).toHaveBeenCalledOnce();
});
it('reports synchronous submission failure and releases the same Config lock', async () => {
  const feedback = vi
    .spyOn(coreEvents, 'emitFeedback')
    .mockImplementation(() => {});
  const config = {} as Config;
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: () => {
      throw Error('Fixture synchronous failure');
    },
  });
  const post = await client();
  expect(await post()).toBe(202);
  const submit = vi.fn(async () => {});
  disconnect = connectDrillSession({ config, isReady: () => true, submit });
  expect(await post()).toBe(202);
  expect(submit).toHaveBeenCalledOnce();
  expect(feedback).toHaveBeenCalledOnce();
});
