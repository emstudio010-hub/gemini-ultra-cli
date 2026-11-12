/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nManager } from '../i18n/i18nManager.js';
import {
  createSwarm,
  getSwarmEngine,
  consumeSwarmRequest,
  setSwarmBudget,
  readSwarm,
} from './swarm.js';
import { SwarmBudgetError } from './swarmBudgetError.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-budget-handoff-'));
  vi.spyOn(I18nManager.getInstance(), 't').mockImplementation((_zh, en) => en);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('returns the retained independent rejection and saved-state locations at the local budget boundary without changing evidence', async () => {
  const task = createSwarm(root, 'Review a generated report');
  setSwarmBudget(root, task.id, {
    maxRequests: 24,
    maxFailedTurns: 1,
    maxTurns: 3,
  });
  const engine = getSwarmEngine(root, task.id, async () => ({
    completed: true,
    text: JSON.stringify({
      passed: false,
      summary: 'CALL site mismatch; report retained.',
      evidence: ['REPORT.md', 'evidence.json'],
    }),
  }));
  engine.add(
    'verifier',
    'workflow-auditor',
    'Independently inspect the report',
  );
  await engine.wait(new AbortController().signal);
  const directory = path.join(root, 'swarms', task.id);
  const before = Object.fromEntries(
    fs
      .readdirSync(directory)
      .map((file) => [file, fs.readFileSync(path.join(directory, file))]),
  );
  let error: unknown;
  try {
    consumeSwarmRequest(root);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SwarmBudgetError);
  const message = (error as Error).message;
  expect(message).toContain('Swarm blocked locally');
  expect(message).toContain(task.id);
  expect(message).toContain('CALL site mismatch; report retained.');
  expect(message).toContain('Saved review @verifier: failed');
  expect(message).toContain('REPORT.md');
  expect(message).toContain('evidence.json');
  expect(message).toContain(path.join(directory, 'members.json'));
  expect(message).toContain(path.join(directory, 'board.jsonl'));
  expect(readSwarm(root, task.id)).toMatchObject({
    phase: 'blocked',
    budget: { requests: 0, failedTurns: 1 },
  });
  expect(
    Object.fromEntries(
      fs
        .readdirSync(directory)
        .map((file) => [file, fs.readFileSync(path.join(directory, file))]),
    ),
  ).toEqual(before);
});

it('uses the current language for a request-budget handoff even without a verifier', () => {
  vi.mocked(I18nManager.getInstance().t).mockImplementation((zh) => zh);
  const task = createSwarm(root, 'Bound coordinator calls');
  setSwarmBudget(root, task.id, {
    maxRequests: 1,
    maxFailedTurns: 1,
    maxTurns: 3,
  });
  consumeSwarmRequest(root);
  expect(() => consumeSwarmRequest(root)).toThrow('蜂群已在本地受阻');
  expect(readSwarm(root, task.id)).toMatchObject({
    phase: 'blocked',
    budget: { requests: 1 },
  });
});

it.each(['en', 'zh'] as const)(
  'includes the paused member failure in a %s handoff without retrying or changing saved results',
  async (locale) => {
    vi.mocked(I18nManager.getInstance().t).mockImplementation((zh, en) =>
      locale === 'zh' ? zh : en,
    );
    const task = createSwarm(root, 'Retain a truncated member attempt');
    setSwarmBudget(root, task.id, {
      maxRequests: 24,
      maxFailedTurns: 1,
      maxTurns: 3,
    });
    const run = vi.fn(async () => ({
      completed: false,
      text: 'OpenAI output token limit reached; response is incomplete.',
    }));
    const engine = getSwarmEngine(root, task.id, run);
    engine.add('prototypes', 'researcher', 'Read existing prototypes');
    await engine.wait(new AbortController().signal);
    const file = path.join(root, 'swarms', task.id, 'members.json');
    const before = fs.readFileSync(file);
    let error: unknown;
    try {
      consumeSwarmRequest(root);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SwarmBudgetError);
    expect((error as Error).message).toContain('@prototypes');
    expect((error as Error).message).toContain(
      'OpenAI output token limit reached; response is incomplete.',
    );
    expect((error as Error).message).toContain(
      locale === 'zh'
        ? '暂停成员保留摘要（不代表本轮完成）'
        : 'Retained paused-member excerpt (not turn completion)',
    );
    expect((error as Error).message).toContain(
      locale === 'zh'
        ? '增加调度预算不会修复成员错误'
        : 'Increasing the dispatch budget does not fix a member error',
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(file)).toEqual(before);
  },
);

it('shows a later failure before the earlier accepted result without presenting another waiting member as failed', async () => {
  const task = createSwarm(root, 'Preserve an accepted result and later error');
  let runs = 0;
  const engine = getSwarmEngine(root, task.id, async () => ({
    completed: true,
    text: 'Earlier accepted result',
  }));
  engine.add('reader', 'researcher', 'Read local evidence');
  await engine.wait(new AbortController().signal);
  const state = readSwarm(root, task.id);
  // Reconstruct a persisted later failed attempt while retaining its prior output.
  state.phase = 'blocked';
  state.stopReason = 'Swarm failed-turn budget exhausted.';
  state.members[0].state = 'paused';
  state.members[0].lastError = 'Later attempt: output token limit reached.';
  state.members.push({
    ...state.members[0],
    name: 'waiting-peer',
    state: 'waiting',
    lastError: undefined,
    result: 'Unrelated accepted peer result',
  });
  const file = path.join(root, 'swarms', task.id, 'members.json');
  fs.writeFileSync(file, JSON.stringify(state));
  const before = fs.readFileSync(file);
  try {
    consumeSwarmRequest(root);
  } catch (error) {
    runs++;
    expect((error as Error).message).toContain(
      'Later attempt: output token limit reached.',
    );
    expect((error as Error).message).not.toContain('Earlier accepted result');
    expect((error as Error).message).not.toContain(
      'Unrelated accepted peer result',
    );
  }
  expect(runs).toBe(1);
  expect(fs.readFileSync(file)).toEqual(before);
});
