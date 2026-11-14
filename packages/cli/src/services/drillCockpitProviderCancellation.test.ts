/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProviderManager, type Config } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-cockpit-catalog-cancel-'),
  );
  vi.stubEnv('GEMINI_ULTRA_PROVIDERS_FILE', path.join(root, 'providers.json'));
  ProviderManager.resetInstance();
});
afterEach(() => {
  stopDrillCockpit();
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  expect(path.dirname(fs.realpathSync(root))).toBe(
    fs.realpathSync(os.tmpdir()),
  );
  expect(path.basename(root)).toMatch(/^ultra-cockpit-catalog-cancel-/);
  fs.rmSync(root, { recursive: true, force: true });
});
async function fixture(stage: 'headers' | 'body' | 'normal') {
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let socketClosed = false;
  const upstream = http.createServer((req, res) => {
    req.socket.once('close', () => {
      socketClosed = true;
    });
    if (stage === 'normal') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"data":[{"id":"fixture-model"}]}');
    } else if (stage === 'body') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.flushHeaders();
      res.write('{"data":');
    }
    entered();
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, '127.0.0.1', resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === 'string') throw Error('No fixture port');
  const manager = ProviderManager.getInstance();
  const provider = manager.upsertProvider({
    name: 'Fixture',
    baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
    apiKey: 'FAKE_ONLY',
    models: ['saved-model'],
  });
  const before = fs.readFileSync(path.join(root, 'providers.json'));
  const disconnect = connectDrillSession({
    config: {} as Config,
    isReady: () => true,
    submit: async () => {
      throw Error('No task dispatch');
    },
  });
  const url = new URL(await startDrillCockpit());
  const controller = new AbortController();
  const pending = new Promise<Response>((resolve, reject) => {
    const request = http.request(
      url.origin + '/api/provider-models',
      {
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'X-Drill-Token': url.hash.slice(1),
          Connection: 'close',
        },
        signal: controller.signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
            }),
          ),
        );
      },
    );
    request.on('error', reject);
    request.end(
      JSON.stringify({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: '',
        protocol: provider.protocol,
        models: provider.models,
      }),
    );
  });
  const outcome = pending.then(
    (response) => ({ response }),
    (error: unknown) => ({ error }),
  );
  const waitRequested = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        requested,
        outcome.then((value) => {
          if ('error' in value) throw value.error;
          throw Error(
            'Cockpit replied before upstream request: ' + value.response.status,
          );
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error('Fixture upstream request was not observed')),
            1500,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    requested: waitRequested(),
    controller,
    outcome,
    before,
    closed: () => socketClosed,
    cleanup: async () => {
      controller.abort();
      disconnect();
      stopDrillCockpit();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    },
  };
}
it.each(['headers', 'body'] as const)(
  'cancels upstream model discovery after browser disconnect during %s',
  async (stage) => {
    const view = await fixture(stage);
    try {
      await view.requested;
      view.controller.abort();
      await view.outcome;
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(view.closed()).toBe(true);
      expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
        view.before,
      );
    } finally {
      await view.cleanup();
    }
  },
);
it('cancels upstream model discovery when the cockpit server stops', async () => {
  const view = await fixture('body');
  try {
    await view.requested;
    stopDrillCockpit();
    await view.outcome;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(view.closed()).toBe(true);
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      view.before,
    );
  } finally {
    await view.cleanup();
  }
});
it('returns a normal model catalog without saving provider configuration', async () => {
  const view = await fixture('normal');
  try {
    const outcome = await view.outcome;
    expect(outcome).toHaveProperty('response');
    if ('response' in outcome)
      expect(await outcome.response.json()).toEqual({
        models: ['fixture-model'],
      });
    expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(
      view.before,
    );
  } finally {
    await view.cleanup();
  }
});
