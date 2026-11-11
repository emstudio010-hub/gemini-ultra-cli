/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lockSync } from 'proper-lockfile';
import { I18nManager } from '../i18n/i18nManager.js';

const held = new Set<string>();

/** Only bounded synchronous state changes belong here, never model/tool execution. */
export function withAgentTaskLock<T>(root: string, action: () => T): T {
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.realpathSync(root);
  const key =
    process.platform === 'win32' ? directory.toLowerCase() : directory;
  if (held.has(key)) return action();
  let release: () => void;
  try {
    release = lockSync(path.join(directory, 'agent-task-transition'), {
      realpath: false,
      retries: 0,
      stale: 30000,
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ELOCKED'
    )
      throw new Error(
        I18nManager.getInstance().t(
          '另一个 CLI 正在更新 Agent 任务状态，请在更新完成后重试该命令。',
          'Another CLI is updating Agent task state. Retry the command after that update finishes.',
        ),
        { cause: error },
      );
    throw error;
  }
  held.add(key);
  try {
    return action();
  } finally {
    held.delete(key);
    release();
  }
}
