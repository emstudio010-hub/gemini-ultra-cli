/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lockSync } from 'proper-lockfile';
import { I18nManager } from '../i18n/i18nManager.js';
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

it('switches the busy diagnostic at throw time while retaining the lock error cause and current owner', () => {
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  const i18n = I18nManager.getInstance();
  const previous = i18n.getLocale();
  let release: (() => void) | undefined;
  const action = vi.fn();
  try {
    release = lockSync(path.join(root, 'agent-task-transition'), {
      realpath: false,
      retries: 0,
      stale: 30000,
    });
    for (const locale of ['en', 'zh', 'en'] as const) {
      i18n.setLocale(locale);
      let caught: unknown;
      try {
        withAgentTaskLock(root, action);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).toMatchObject({
        message:
          locale === 'zh'
            ? '另一个 CLI 正在更新 Agent 任务状态，请在更新完成后重试该命令。'
            : 'Another CLI is updating Agent task state. Retry the command after that update finishes.',
        cause: { code: 'ELOCKED' },
      });
      expect(fs.existsSync(path.join(root, 'agent-task-transition.lock'))).toBe(
        true,
      );
    }
    expect(action).not.toHaveBeenCalled();
  } finally {
    try {
      release?.();
    } finally {
      i18n.setLocale(previous);
      vi.unstubAllEnvs();
    }
  }
});
