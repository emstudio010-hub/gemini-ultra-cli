/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readUltraRuntime } from './ultraRuntime.js';

/** Shared by direct invocations and parallel batches in the same session. */
export function getMaxParallelSubagents(): number {
  const runtime = readUltraRuntime();
  if (runtime.collaboration === 'single') return 1;
  const raw = Number(process.env['GEMINI_ULTRA_MAX_PARALLEL_SUBAGENTS']);
  return Number.isFinite(raw) && raw >= 1
    ? Math.min(runtime.maxParallel, Math.floor(raw), 8)
    : runtime.maxParallel;
}

interface Waiter {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
}
interface SessionQueue {
  active: number;
  limit: number;
  waiting: Waiter[];
}
const sessions = new Map<string, SessionQueue>();

function drain(sessionId: string, queue: SessionQueue): void {
  while (queue.active < queue.limit && queue.waiting.length) {
    const waiter = queue.waiting.shift()!;
    waiter.signal.removeEventListener('abort', waiter.onAbort);
    if (waiter.signal.aborted) {
      waiter.reject(waiter.signal.reason);
      continue;
    }
    queue.active++;
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      queue.active--;
      drain(sessionId, queue);
    });
  }
  if (
    !queue.active &&
    !queue.waiting.length &&
    sessions.get(sessionId) === queue
  ) {
    sessions.delete(sessionId);
  }
}

/** Keep a slot until actual execution settles, including cancellation cleanup. */
export async function scheduleSubagent<T>(
  sessionId: string,
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let queue = sessions.get(sessionId);
  if (!queue) {
    queue = { active: 0, limit: getMaxParallelSubagents(), waiting: [] };
    sessions.set(sessionId, queue);
  }
  const current = queue;
  current.limit = getMaxParallelSubagents();
  const release = await new Promise<() => void>((resolve, reject) => {
    const waiter: Waiter = {
      signal,
      resolve,
      reject,
      onAbort: () => {
        const index = current.waiting.indexOf(waiter);
        if (index < 0) return;
        current.waiting.splice(index, 1);
        reject(signal.reason);
        drain(sessionId, current);
      },
    };
    current.waiting.push(waiter);
    signal.addEventListener('abort', waiter.onAbort, { once: true });
    drain(sessionId, current);
  });
  try {
    signal.throwIfAborted();
    return await run();
  } finally {
    release();
  }
}
