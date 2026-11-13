/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { SkillManager, type SkillDefinition } from './skillManager.js';
import { Storage } from '../config/storage.js';
import { loadSkillsFromDir } from './skillLoader.js';
vi.mock('./skillLoader.js', () => ({ loadSkillsFromDir: vi.fn() }));
vi.mock('./skillOrchestrator.js', () => ({
  getMultiSourceSkillDirs: () => [],
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const skill = (name: string): SkillDefinition => ({
  name,
  description: name,
  body: name,
  location: `/${name}/SKILL.md`,
});
function setup() {
  vi.useFakeTimers();
  vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue('/fixture-user');
  vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
    '/fixture-user-agent',
  );
  const storage = {
    getProjectSkillsDir: () => '/fixture-project',
    getProjectAgentSkillsDir: () => '/fixture-project-agent',
  } as Storage;
  const manager = new SkillManager();
  manager.addSkills([skill('saved')]);
  let release!: (skills: SkillDefinition[]) => void;
  const gate = new Promise<SkillDefinition[]>((resolve) => {
    release = resolve;
  });
  const signals: Array<AbortSignal | undefined> = [];
  vi.mocked(loadSkillsFromDir).mockImplementation(async (directory, signal) => {
    if (directory !== '/fixture-user') return [];
    signals.push(signal);
    return signals.length === 1 ? gate : [skill('fresh')];
  });
  return { manager, storage, release, signals };
}

it('ends a stalled discovery after ten seconds and prevents late publication', async () => {
  const f = setup();
  let outcome: unknown = 'pending';
  const pending = f.manager.discoverSkills(f.storage).then(
    () => {
      outcome = 'success';
    },
    (error) => {
      outcome = error;
    },
  );
  await vi.advanceTimersByTimeAsync(10_000);
  const atDeadline = outcome;
  const aborted = f.signals[0]?.aborted;
  f.release([skill('late')]);
  await pending;
  expect(atDeadline).toMatchObject({ name: 'SkillDiscoveryTimeoutError' });
  expect(aborted).toBe(true);
  expect(f.manager.getSkills().map((s) => s.name)).toEqual(['saved']);
  expect(vi.getTimerCount()).toBe(0);
  await f.manager.discoverSkills(f.storage);
  expect(f.manager.getSkills().map((s) => s.name)).toEqual(['fresh']);
  expect(vi.getTimerCount()).toBe(0);
});

it('stops waiting for a superseded discovery even when its reader ignores the signal', async () => {
  const f = setup();
  let settled = false;
  const old = f.manager.discoverSkills(f.storage).then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  await f.manager.discoverSkills(f.storage);
  await vi.advanceTimersByTimeAsync(0);
  const beforeRelease = settled;
  const aborted = f.signals[0]?.aborted;
  f.release([skill('stale')]);
  await old;
  expect(beforeRelease).toBe(true);
  expect(aborted).toBe(true);
  expect(f.manager.getSkills().map((s) => s.name)).toEqual(['fresh']);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['clear', 'disable-admin', 'add', 'filter'] as const)(
  'aborts pending reads after explicit %s',
  async (action) => {
    const f = setup();
    let settled = false;
    const pending = f.manager.discoverSkills(f.storage).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    if (action === 'clear') f.manager.clearSkills();
    else if (action === 'disable-admin') f.manager.setAdminSettings(false);
    else if (action === 'add') f.manager.addSkills([skill('explicit')]);
    else f.manager.filterSkills(() => false);
    await vi.advanceTimersByTimeAsync(0);
    const beforeRelease = settled;
    const aborted = f.signals[0]?.aborted;
    f.release([skill('stale')]);
    await pending;
    expect(beforeRelease).toBe(true);
    expect(aborted).toBe(true);
    expect(f.manager.getSkill('stale')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('propagates caller cancellation and leaves the published catalog available', async () => {
  const f = setup();
  const controller = new AbortController();
  const reason = new Error('Caller stopped discovery');
  let outcome: unknown = 'pending';
  const pending = f.manager
    .discoverSkills(f.storage, [], false, controller.signal)
    .then(
      () => {
        outcome = 'success';
      },
      (error) => {
        outcome = error;
      },
    );
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  const beforeRelease = outcome;
  f.release([skill('stale')]);
  await pending;
  expect(beforeRelease).toBe(reason);
  expect(f.signals[0]?.aborted).toBe(true);
  expect(f.manager.getSkills().map((s) => s.name)).toEqual(['saved']);
});

it('does not invalidate an active discovery when another caller was already cancelled', async () => {
  const f = setup();
  const pending = f.manager.discoverSkills(f.storage);
  await vi.advanceTimersByTimeAsync(0);
  const controller = new AbortController();
  const reason = new Error('Precancelled');
  controller.abort(reason);
  let outcome: unknown = 'pending';
  const cancelled = f.manager
    .discoverSkills(f.storage, [], false, controller.signal)
    .then(
      () => {
        outcome = 'success';
      },
      (error) => {
        outcome = error;
      },
    );
  await vi.advanceTimersByTimeAsync(0);
  const observed = outcome;
  const firstSignalAborted = f.signals[0]?.aborted;
  f.release([skill('first')]);
  await Promise.all([pending, cancelled]);
  expect(observed).toBe(reason);
  expect(firstSignalAborted).toBe(false);
  expect(f.manager.getSkills().map((s) => s.name)).toEqual(['first']);
});
