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
