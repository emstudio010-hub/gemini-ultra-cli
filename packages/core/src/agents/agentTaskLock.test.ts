/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { withAgentTaskLock } from './agentTaskLock.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-task-lock-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it('reenters through an equivalent path and releases the claim after a failed nested transition', () => {
  fs.mkdirSync(path.join(root, 'child'));
  expect(() =>
    withAgentTaskLock(root, () =>
      withAgentTaskLock(path.join(root, 'child', '..'), () => {
        throw new Error('Failed transition');
      }),
    ),
  ).toThrow('Failed transition');
  expect(fs.existsSync(path.join(root, 'agent-task-transition.lock'))).toBe(
    false,
  );
  withAgentTaskLock(root, () =>
    fs.writeFileSync(path.join(root, 'accepted'), 'next transition'),
  );
  expect(fs.readFileSync(path.join(root, 'accepted'), 'utf8')).toBe(
    'next transition',
  );
  expect(fs.existsSync(path.join(root, 'agent-task-transition.lock'))).toBe(
    false,
  );
});

it('recovers an expired lock-directory fixture without leaving a permanent busy state', () => {
  const lock = path.join(root, 'agent-task-transition.lock');
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 120000);
  fs.utimesSync(lock, old, old);
  withAgentTaskLock(root, () =>
    fs.writeFileSync(path.join(root, 'recovered'), 'saved'),
  );
  expect(fs.readFileSync(path.join(root, 'recovered'), 'utf8')).toBe('saved');
  expect(fs.existsSync(lock)).toBe(false);
});
