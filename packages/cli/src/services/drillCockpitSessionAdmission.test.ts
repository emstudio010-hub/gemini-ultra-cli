/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import http from 'node:http';
import type { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';
let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  stopDrillCockpit();
  vi.restoreAllMocks();
});
async function pendingRequest(
  config: Config,
  submit: (prompt: string) => Promise<void>,
) {
  disconnect = connectDrillSession({ config, isReady: () => true, submit });
  const url = new URL(await startDrillCockpit());
  let seen!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    seen = resolve;
  });
  const original: EventEmitter['emit'] = http.Server.prototype.emit;
  vi.spyOn(http.Server.prototype, 'emit').mockImplementation(function (
    this: http.Server,
    event: string | symbol,
    ...args: unknown[]
  ) {
    const result = original.call(this, event, ...args);
    if (event === 'request') seen();
    return result;
  });
  let finish!: () => void;
  const response = new Promise<number>((resolve, reject) => {
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
    request.write('{"prompt":');
    finish = () => request.end('"Fixture"}');
  });
  await dispatched;
  return { response, finish: () => finish() };
}
it('uses latest readiness after reading a delayed request body', async () => {
  const config = {} as Config;
  const oldSubmit = vi.fn(async () => {});
  const newSubmit = vi.fn(async () => {});
  const view = await pendingRequest(config, oldSubmit);
  disconnect = connectDrillSession({
    config,
    isReady: () => false,
    submit: newSubmit,
  });
  view.finish();
  expect(await view.response).toBe(409);
  expect(oldSubmit).not.toHaveBeenCalled();
  expect(newSubmit).not.toHaveBeenCalled();
});
it('refuses a delayed request whose session has disconnected', async () => {
  const submit = vi.fn(async () => {});
  const view = await pendingRequest({} as Config, submit);
  disconnect?.();
  view.finish();
  expect(await view.response).toBe(409);
  expect(submit).not.toHaveBeenCalled();
});
it('refuses a delayed request after switching to a different Config', async () => {
  const oldSubmit = vi.fn(async () => {});
  const nextSubmit = vi.fn(async () => {});
  const view = await pendingRequest({} as Config, oldSubmit);
  disconnect = connectDrillSession({
    config: {} as Config,
    isReady: () => true,
    submit: nextSubmit,
  });
  view.finish();
  expect(await view.response).toBe(409);
  expect(oldSubmit).not.toHaveBeenCalled();
  expect(nextSubmit).not.toHaveBeenCalled();
});
it('uses the latest submit callback for a still-ready same Config', async () => {
  const config = {} as Config;
  const oldSubmit = vi.fn(async () => {});
  const nextSubmit = vi.fn(async () => {});
  const view = await pendingRequest(config, oldSubmit);
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: nextSubmit,
  });
  view.finish();
  expect(await view.response).toBe(202);
  expect(oldSubmit).not.toHaveBeenCalled();
  expect(nextSubmit).toHaveBeenCalledWith('Fixture');
});
