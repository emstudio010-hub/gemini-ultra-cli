/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readLocalJsonConfig } from '../utils/localJsonConfig.js';

const runtimeSchema = z.object({
  collaboration: z.enum(['auto', 'single', 'team']).default('auto'),
  maxParallel: z.number().int().min(1).max(8).default(3),
  workflow: z.enum(['general', 'redteam']).default('general'),
});
export type UltraRuntime = z.infer<typeof runtimeSchema>;
function runtimePath(): string {
  return (
    process.env['GEMINI_ULTRA_RUNTIME_FILE'] ||
    path.join(os.homedir(), '.gemini', 'ultra-runtime.json')
  );
}

export function readUltraRuntime(): UltraRuntime {
  const file = runtimePath();
  return readLocalJsonConfig(
    file,
    (value) => runtimeSchema.parse(value),
    () => runtimeSchema.parse({}),
    '/team auto',
    16384,
  );
}

export function saveUltraRuntime(value: unknown): UltraRuntime {
  const next = runtimeSchema.parse(value);
  const file = runtimePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return next;
}

export interface CollaborationTaskState {
  id: string;
  batchId: string;
  sessionId: string;
  agent: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}
const tasks = new Map<string, CollaborationTaskState>();
export function updateCollaborationTask(task: CollaborationTaskState): void {
  tasks.set(task.id, { ...task });
  if (tasks.size > 300) {
    for (const [id, entry] of tasks) {
      if (!['queued', 'running'].includes(entry.status)) {
        tasks.delete(id);
        break;
      }
    }
  }
}
export function listCollaborationTasks(
  sessionId: string,
): CollaborationTaskState[] {
  return [...tasks.values()]
    .filter((task) => task.sessionId === sessionId)
    .map((task) => ({ ...task }));
}
