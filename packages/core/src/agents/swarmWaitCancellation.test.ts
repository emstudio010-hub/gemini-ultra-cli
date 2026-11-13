/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import fsNative from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  readSwarm,
  cancelSavedSwarm,
} from './swarm.js';
import { ManageSwarmTool } from './swarmTools.js';
import { ApprovalMode } from '../policy/types.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-wait-cancel-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['engine', 'saved'] as const)(
  'interrupts running members before %s cancellation state is persisted',
  async (entry) => {
    const swarm = createSwarm(
      root,
      'Stop work even if cancellation cannot be saved',
    );
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      release = resolve;
    });
    let childSignal: AbortSignal | undefined;
    const engine = getSwarmEngine(
      root,
      swarm.id,
      async (_agent, _prompt, signal) => {
        childSignal = signal;
        started();
        await cleanup;
        return { completed: false, text: 'Child cleanup complete' };
      },
    );
    engine.add('analyst', 'researcher', 'Stop before state write');
    await start;
    const file = path.join(root, 'swarms', swarm.id, 'members.json');
    const before = fs.readFileSync(file);
    const rename = fs.renameSync;
    const failure = vi
      .spyOn(fsNative, 'renameSync')
      .mockImplementation((from, to) => {
        if (to === file) throw new Error('Cancellation save failed');
        return rename(from, to);
      });
    syncBuiltinESMExports();
    try {
      expect(() =>
        entry === 'engine' ? engine.cancel() : cancelSavedSwarm(root, swarm.id),
      ).toThrow('Cancellation save failed');
      expect(childSignal?.aborted).toBe(true);
      expect(engine.hasRunningMembers()).toBe(true);
      expect(fs.readFileSync(file)).toEqual(before);
      failure.mockRestore();
      syncBuiltinESMExports();
      release();
      await engine.wait(new AbortController().signal);
      expect(engine.hasRunningMembers()).toBe(false);
      expect(readSwarm(root, swarm.id)).toMatchObject({
        members: [{ state: 'paused' }],
        budget: { turns: 1, failedTurns: 0 },
      });
      expect(cancelSavedSwarm(root, swarm.id)).toMatchObject({
        phase: 'cancelled',
        budget: { turns: 1, failedTurns: 0 },
      });
    } finally {
      failure.mockRestore();
      syncBuiltinESMExports();
      engine.cancel();
      release();
      await engine.wait(new AbortController().signal);
    }
  },
);

it('routes a pre-cancelled manage_swarm wait through existing member cleanup', async () => {
  const swarm = createSwarm(root, 'Cancel at the public tool boundary');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = vi.fn(async () => {
    await gate;
    return { completed: true, text: 'Late fixture result' };
  });
  const engine = getSwarmEngine(root, swarm.id, runner);
  engine.add(
    'analyst',
    'researcher',
    'Do not run after the tool was cancelled',
  );
  const context = {
    config: {
      storage: { getProjectTempDir: () => root },
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getTargetDir: () => root,
    },
  } as unknown as AgentLoopContext;
  const tool = new ManageSwarmTool(context, createMockMessageBus());
  const reason = new Error('Public tool was already cancelled');
  try {
    await expect(
      tool
        .build({ swarm_id: swarm.id, action: 'wait' })
        .execute({ abortSignal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(runner).not.toHaveBeenCalled();
    expect(engine.hasRunningMembers()).toBe(false);
    expect(readSwarm(root, swarm.id).phase).toBe('cancelled');
  } finally {
    engine.cancel();
    release();
    await engine.wait(new AbortController().signal);
  }
});

it('pre-cancels queued swarm members without starting a runner and settles them before returning', async () => {
  const swarm = createSwarm(root, 'Cancel before queued work starts');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = vi.fn(async () => {
    await gate;
    return { completed: true, text: 'Late fixture result' };
  });
  const engine = getSwarmEngine(root, swarm.id, runner);
  engine.add('analyst', 'researcher', 'Do not start after cancellation');
  const reason = new Error('User cancelled before wait');
  try {
    await expect(engine.wait(AbortSignal.abort(reason))).rejects.toBe(reason);
    expect(runner).not.toHaveBeenCalled();
    expect(engine.hasRunningMembers()).toBe(false);
    expect(readSwarm(root, swarm.id)).toMatchObject({
      phase: 'cancelled',
      budget: { turns: 1, failedTurns: 0 },
    });
  } finally {
    engine.cancel();
    release();
    await engine.wait(new AbortController().signal);
  }
});

it.each([
  { preCancelled: true, failSave: false },
  { preCancelled: true, failSave: true },
  { preCancelled: false, failSave: true },
])(
  'cancels a working swarm and drains cleanup with preCancelled=$preCancelled and failSave=$failSave',
  async ({ preCancelled, failSave }) => {
    const swarm = createSwarm(root, 'Cancel an already started member');
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      release = resolve;
    });
    let childSignal: AbortSignal | undefined;
    const engine = getSwarmEngine(
      root,
      swarm.id,
      async (_agent, _prompt, signal) => {
        childSignal = signal;
        started();
        await cleanup;
        return { completed: true, text: 'Late fixture result' };
      },
    );
    engine.add('analyst', 'researcher', 'Retain evidence on cancellation');
    await start;
    const file = path.join(root, 'swarms', swarm.id, 'members.json');
    const before = fs.readFileSync(file);
    const rename = fs.renameSync;
    let restore = () => {};
    if (failSave) {
      const spy = vi
        .spyOn(fsNative, 'renameSync')
        .mockImplementation((from, to) => {
          if (to === file) throw new Error('Cancellation state save failed');
          return rename(from, to);
        });
      syncBuiltinESMExports();
      restore = () => {
        spy.mockRestore();
        syncBuiltinESMExports();
      };
    }
    const reason = new Error(
      'User cancelled before waiting on the running member',
    );
    const controller = new AbortController();
    if (preCancelled) controller.abort(reason);
    let settled = false;
    const waiting = engine.wait(controller.signal);
    void waiting.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    if (!preCancelled) controller.abort(reason);
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(childSignal?.aborted).toBe(true);
      expect(settled).toBe(false);
      expect(engine.hasRunningMembers()).toBe(true);
      if (failSave) expect(fs.readFileSync(file)).toEqual(before);
      restore();
      release();
      if (failSave)
        await expect(waiting).rejects.toThrow('Cancellation state save failed');
      else await expect(waiting).rejects.toBe(reason);
      expect(engine.hasRunningMembers()).toBe(false);
      const saved = readSwarm(root, swarm.id);
      expect(saved.members[0].state).toBe('paused');
      expect(saved.budget.failedTurns).toBe(0);
      if (!failSave) expect(saved.phase).toBe('cancelled');
    } finally {
      restore();
      engine.cancel();
      release();
      await engine.wait(new AbortController().signal);
      await waiting.catch(() => {});
    }
  },
);
