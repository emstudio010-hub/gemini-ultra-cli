/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import {
  connectDrillSession,
  startDrillCockpit,
  stopDrillCockpit,
} from './drillCockpit.js';

let disconnect: (() => void) | undefined;
let release: (() => void) | undefined;
let root: string | undefined;
afterEach(async () => {
  release?.();
  await new Promise((resolve) => setImmediate(resolve));
  disconnect?.();
  stopDrillCockpit();
  vi.restoreAllMocks();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it('creates and dispatches one saved goal, permits pause/export while busy, resumes by ID and rejects stale pages', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-cockpit-goal-'));
  let ready = true;
  const submit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const config = {
    storage: { getProjectTempDir: () => root! },
    getApprovalMode: () => 'default',
    getSessionId: () => 'goal-session',
  } as unknown as Config;
  disconnect = connectDrillSession({ config, isReady: () => ready, submit });
  const url = new URL(await startDrillCockpit());
  const post = (endpoint: string, body: object, session = 'goal-session') =>
    fetch(url.origin + '/api/' + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Drill-Token': url.hash.slice(1),
        'X-Drill-Session': session,
      },
      body: JSON.stringify(body),
    });
  const created = await post('goals', {
    objective: 'Create a real saved goal record.',
    start: true,
  });
  expect(created.status).toBe(202);
  const goal = (await created.json()) as { id: string; mode: string };
  expect(submit).toHaveBeenCalledExactlyOnceWith('/goal resume ' + goal.id);
  ready = false;
  expect(
    (await post('agent-task/action', { ...goal, action: 'resume' })).status,
  ).toBe(409);
  const selection = { mode: 'boost', id: goal.id };
  expect(
    (await post('agent-task/action', { ...selection, action: 'pause' })).status,
  ).toBe(200);
  const exported = await post('agent-task/action', {
    ...selection,
    action: 'reports',
  });
  expect(exported.status).toBe(200);
  const report = (await exported.json()) as { download: string };
  expect(JSON.parse(report.download).snapshot.record.phase).toBe('cancelled');
  release?.();
  await new Promise((resolve) => setImmediate(resolve));
  ready = true;
  expect(
    (await post('agent-task/action', { ...selection, action: 'resume' }))
      .status,
  ).toBe(202);
  expect(submit).toHaveBeenLastCalledWith('/goal resume ' + goal.id);
  expect(
    (await post('goals', { objective: 'Must not create.' }, 'old-session'))
      .status,
  ).toBe(409);
  expect(
    fs
      .readdirSync(path.join(root, 'agent-workflows'))
      .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)),
  ).toHaveLength(1);
});
