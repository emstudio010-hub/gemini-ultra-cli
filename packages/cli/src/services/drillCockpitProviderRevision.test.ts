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
import { Config, ProviderManager, DrillStore } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';
let root: string;
let config: Config;
let disconnect: (() => void) | undefined;
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'ultra-cockpit-provider-revision-'),
  );
  for (const [key, name] of Object.entries({
    GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
    GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
    GEMINI_DRILL_DB: 'drill.sqlite',
    GEMINI_DRILL_DIR: 'drill',
    GEMINI_CLI_HOME: 'home',
  }))
    vi.stubEnv(key, path.join(root, name));
  ProviderManager.resetInstance();
});
afterEach(async () => {
  disconnect?.();
  disconnect = undefined;
  stopDrillCockpit();
  await config?.dispose();
  DrillStore.resetInstance();
  ProviderManager.resetInstance();
  vi.unstubAllEnvs();
  expect(path.dirname(fs.realpathSync(root))).toBe(
    fs.realpathSync(os.tmpdir()),
  );
  expect(path.basename(root)).toMatch(/^ultra-cockpit-provider-revision-/);
  fs.rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const manager = ProviderManager.getInstance();
  const provider = manager.upsertProvider({
    name: 'Fixture',
    baseUrl: 'https://fixture.invalid/v1',
    apiKey: 'FAKE_PRIVATE_KEY',
    models: ['first', 'preferred'],
    defaultModel: 'preferred',
  });
  config = new Config({
    sessionId: 'revision-fixture',
    model: 'first',
    cwd: root,
    targetDir: root,
    debugMode: false,
    usageStatisticsEnabled: false,
    skillsSupport: false,
    enableHooks: false,
  });
  disconnect = connectDrillSession({
    config,
    isReady: () => true,
    submit: async () => {
      throw Error('No dispatch');
    },
  });
  const url = new URL(await startDrillCockpit());
  const api = (route: string, body?: unknown) =>
    new Promise<{ status: number; body: Record<string, unknown> }>(
      (resolve, reject) => {
        const request = http.request(
          url.origin + '/api/' + route,
          {
            method: body ? 'POST' : 'GET',
            agent: false,
            headers: {
              'X-Drill-Token': url.hash.slice(1),
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              try {
                resolve({
                  status: res.statusCode ?? 500,
                  body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                });
              } catch (error) {
                reject(error);
              }
            });
            res.on('error', reject);
          },
        );
        request.on('error', reject);
        request.end(body ? JSON.stringify(body) : undefined);
      },
    );
  return { manager, provider, api };
}
it('rejects a stale editor after another view updates the same provider', async () => {
  const view = await fixture();
  const status = await view.api('status');
  const listed = (
    status.body['providers'] as Array<Record<string, unknown>>
  )[0];
  view.manager.upsertProvider({
    ...view.provider,
    models: ['preferred', 'newer'],
    contextWindow: 64000,
    setActive: false,
  });
  const bytes = fs.readFileSync(path.join(root, 'providers.json'));
  const result = await view.api('providers', {
    ...view.provider,
    apiKey: '',
    models: ['first'],
    revision: listed['revision'],
  });
  expect(result.status).toBe(409);
  expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(bytes);
});
it('requires an editing revision rather than accepting an unversioned overwrite', async () => {
  const view = await fixture();
  const bytes = fs.readFileSync(path.join(root, 'providers.json'));
  const result = await view.api('providers', {
    ...view.provider,
    apiKey: '',
    models: ['first'],
  });
  expect(result.status).toBe(409);
  expect(fs.readFileSync(path.join(root, 'providers.json'))).toEqual(bytes);
});
it('returns an opaque revision without exposing credentials and accepts an unchanged editor', async () => {
  const view = await fixture();
  const status = await view.api('status');
  const listed = (
    status.body['providers'] as Array<Record<string, unknown>>
  )[0];
  expect(JSON.stringify(status.body)).not.toContain('FAKE_PRIVATE_KEY');
  expect(listed['revision']).toMatch(/^[a-f0-9]{64}$/);
  const result = await view.api('providers', {
    ...view.provider,
    apiKey: '',
    models: ['first', 'preferred', 'extra'],
    revision: listed['revision'],
  });
  expect(result.status).toBe(200);
  expect(result.body['revision']).toMatch(/^[a-f0-9]{64}$/);
  expect(result.body['revision']).not.toBe(listed['revision']);
  expect(view.manager.getActiveModel()).toBe('preferred');
  expect(view.manager.getProviderById(view.provider.id)?.apiKey).toBe(
    'FAKE_PRIVATE_KEY',
  );
});
