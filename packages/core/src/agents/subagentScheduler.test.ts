/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ maxParallel: 2, collaboration: 'team' }));
vi.mock('./ultraRuntime.js', () => ({ readUltraRuntime: () => runtime }));
import { scheduleSubagent } from './subagentScheduler.js';

it('honors a lower concurrency limit before admitting queued work', async () => {
  vi.stubEnv('GEMINI_ULTRA_MAX_PARALLEL_SUBAGENTS', '');
  const started: number[] = [];
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const signal = new AbortController().signal;
  const first = scheduleSubagent('lower-limit', signal, async () => {
    started.push(1);
    await new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
  });
  const second = scheduleSubagent('lower-limit', signal, async () => {
    started.push(2);
    await new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
  });
  const third = scheduleSubagent('lower-limit', signal, async () => {
    started.push(3);
  });
  try {
    await vi.waitFor(() => expect(started).toEqual([1, 2]));
    runtime.maxParallel = 1;
    finishFirst();
    await first;
    // The other running task already occupies the new single slot.
    expect(started).toEqual([1, 2]);
    finishSecond();
    await Promise.all([second, third]);
    expect(started).toEqual([1, 2, 3]);
  } finally {
    finishFirst?.();
    finishSecond?.();
    await Promise.all([first, second, third]);
    runtime.maxParallel = 2;
    vi.unstubAllEnvs();
  }
});
