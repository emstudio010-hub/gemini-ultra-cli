/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readAgentTaskDetails } from './agentTaskDetails.js';
import { createSwarm } from './swarm.js';
import { saveSwarmResultText } from './swarmResultText.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-task-details-'));
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
function workflow(mode: string) {
  const id = randomUUID();
  fs.mkdirSync(path.join(root, 'agent-workflows'), { recursive: true });
  const file = path.join(root, 'agent-workflows', `${id}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      mode,
      objective: `Saved ${mode}`,
      brief: 'Brief',
      phase: 'blocked',
      stage: 'review',
      previousApprovalMode: 'default',
      approved: true,
      milestones: [
        { title: 'Deliver', acceptance: 'Artifact exists', completed: false },
      ],
      reports: [
        {
          agent: 'coder',
          stage: 'implementation',
          completed: false,
          text: 'Partial result',
        },
      ],
      updatedAt: '2026-11-11T00:00:00.000Z',
    }),
  );
  return { id, mode, file };
}
function contents(directory: string): Record<string, Buffer> {
  return Object.fromEntries(
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? Object.entries(contents(file))
        : [[file, fs.readFileSync(file)]];
    }),
  );
}
it('shows bounded failed-attempt references and a saved history gap without reading archives or mutating records', () => {
  const task = createSwarm(root, 'Recovered task with historical failures');
  const file = path.join(root, 'swarms', task.id, 'members.json');
  const attempts = Array.from({ length: 6 }, (_, index) => ({
    turn: index + 1,
    outcome: 'incomplete',
    fullResult: saveSwarmResultText(
      root,
      task.id,
      `Failed evidence ${index}`,
      true,
    ).fullResult,
  }));
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...task,
      members: [
        {
          name: 'reader',
          agent: 'researcher',
          brief: 'Read only',
          state: 'waiting',
          result: 'Recovered evidence',
          failedAttempts: attempts,
          failureHistoryIncomplete: true,
        },
      ],
    }),
  );
  // The view must describe saved references even if archive storage is unavailable.
  const archiveDir = path.join(root, 'swarms', task.id, 'results');
  for (const entry of fs.readdirSync(archiveDir))
    fs.unlinkSync(path.join(archiveDir, entry));
  const before = contents(root);
  const detail = readAgentTaskDetails(root, { mode: 'swarm', id: task.id });
  expect(detail.kind).toBe('swarm');
  if (detail.kind !== 'swarm') throw new Error('Expected swarm details');
  expect(detail.members[0].failureHistory).toMatchObject({
    count: 6,
    omitted: 2,
    incomplete: true,
    archivesChecked: false,
  });
  expect(
    detail.members[0].failureHistory.recent.map((item) => item.turn),
  ).toEqual([3, 4, 5, 6]);
  expect(
    detail.members[0].failureHistory.recent.every((item) =>
      item.fullResultPath.includes('full-'),
    ),
  ).toBe(true);
  expect(JSON.stringify(detail)).not.toContain('Failed evidence');
  expect(contents(root)).toEqual(before);
});
it('reads all four task kinds by ID without rebinding or creating missing legacy budgets', () => {
  const swarm = createSwarm(root, 'Saved swarm');
  const records = ['boost', 'teamwork', 'grill-me'].map(workflow);
  fs.writeFileSync(
    path.join(root, 'agent-workflows/current.json'),
    '{broken binding',
  );
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{broken binding');
  const before = contents(root);
  for (const item of records) {
    const detail = readAgentTaskDetails(root, { mode: item.mode, id: item.id });
    expect(detail).toMatchObject({
      kind: 'workflow',
      mode: item.mode,
      phase: 'blocked',
      stage: 'review',
      usage: { known: false, requests: null },
    });
    expect(detail.kind === 'workflow' && detail.reports[0].preview).toBe(
      'Partial result',
    );
  }
  expect(
    readAgentTaskDetails(root, { mode: 'swarm', id: swarm.id }),
  ).toMatchObject({
    kind: 'swarm',
    usage: { known: true, requests: 0 },
    phase: 'active',
  });
  expect(contents(root)).toEqual(before);
});
it('bounds member previews and keeps a damaged shared board and unknown accounting explicit', () => {
  const swarm = createSwarm(root, 'Review');
  const directory = path.join(root, 'swarms', swarm.id);
  const file = path.join(directory, 'members.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.members = [
    {
      name: 'analyst',
      agent: 'researcher',
      brief: 'Analyze',
      state: 'paused',
      turns: 2,
      result: 'x'.repeat(12000),
    },
  ];
  delete raw.budgetVersion;
  delete raw.budget;
  fs.writeFileSync(file, JSON.stringify(raw));
  fs.rmSync(path.join(directory, 'owner.json'));
  fs.writeFileSync(
    path.join(directory, 'board.jsonl'),
    '{PRIVATE_BROKEN_BOARD',
  );
  const before = contents(root);
  const detail = readAgentTaskDetails(root, { mode: 'swarm', id: swarm.id });
  expect(detail).toMatchObject({
    usage: { known: false, requests: null, maxRequests: null },
    warnings: ['board-unavailable', 'budget-unavailable'],
  });
  if (detail.kind !== 'swarm') throw new Error('Expected swarm');
  expect(detail.members[0].preview).toHaveLength(1200);
  expect(detail.members[0].previewOnly).toBe(true);
  expect(JSON.stringify(detail)).not.toContain('PRIVATE_BROKEN_BOARD');
  expect(contents(root)).toEqual(before);
});
it('rejects mode mismatch and redirected project records before following a link', () => {
  const item = workflow('boost');
  expect(() =>
    readAgentTaskDetails(root, { mode: 'teamwork', id: item.id }),
  ).toThrow('mode');
  expect(() =>
    readAgentTaskDetails(root, { mode: 'boost', id: '../escape' }),
  ).toThrow();
  const foreign = path.join(root, 'foreign.json');
  fs.renameSync(item.file, foreign);
  fs.symlinkSync(foreign, item.file, 'file');
  expect(() =>
    readAgentTaskDetails(root, { mode: 'boost', id: item.id }),
  ).toThrow('regular project files');
  expect(fs.readFileSync(foreign, 'utf8')).toContain(item.id);
});

it.each(['files', 'member-reports', 'undeclared'] as const)(
  'shows saved workflow review scope %s without reading missing deliverables or archives',
  (kind) => {
    const item = workflow('boost');
    const raw = JSON.parse(fs.readFileSync(item.file, 'utf8'));
    if (kind !== 'undeclared')
      raw.reviewFiles =
        kind === 'files'
          ? Array.from({ length: 10 }, (_, index) => `MISSING-${index}.md`)
          : [];
    if (kind !== 'undeclared')
      raw.reviewedFiles = { directory: root, files: [] };
    fs.writeFileSync(item.file, JSON.stringify(raw));
    const before = contents(root);
    const detail = readAgentTaskDetails(root, { mode: 'boost', id: item.id });
    expect(detail).toMatchObject({
      review: {
        kind,
        totalFiles: kind === 'files' ? 10 : 0,
        omittedFiles: kind === 'files' ? 2 : 0,
        snapshotSaved: kind !== 'undeclared',
        currentFilesChecked: false,
      },
    });
    expect(detail.kind === 'workflow' && detail.review?.files).toHaveLength(
      kind === 'files' ? 8 : 0,
    );
    expect(JSON.stringify(detail)).not.toContain('MISSING-9.md');
    expect(contents(root)).toEqual(before);
  },
);

it('keeps auditor scope distinct from ordinary members and excludes file review from requirements interviews', () => {
  const swarm = createSwarm(root, 'Saved scope');
  const file = path.join(root, 'swarms', swarm.id, 'members.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const member = {
    name: 'reader',
    agent: 'researcher',
    brief: 'Read',
    state: 'waiting',
    turns: 1,
    result: 'Saved',
  };
  raw.members = [
    member,
    {
      ...member,
      name: 'auditor',
      agent: 'workflow-auditor',
      reviewFiles: ['<img src=x>.md'],
      reviewedFiles: { directory: root, files: [] },
    },
  ];
  fs.writeFileSync(file, JSON.stringify(raw));
  const interview = workflow('grill-me');
  const before = contents(root);
  const detail = readAgentTaskDetails(root, { mode: 'swarm', id: swarm.id });
  if (detail.kind !== 'swarm') throw new Error('Expected swarm');
  expect(detail.members[0].review).toBeUndefined();
  expect(detail.members[1].review).toMatchObject({
    kind: 'files',
    files: ['<img src=x>.md'],
    snapshotSaved: true,
    currentFilesChecked: false,
  });
  const grill = readAgentTaskDetails(root, {
    mode: 'grill-me',
    id: interview.id,
  });
  expect(grill.kind === 'workflow' && grill.review).toBeUndefined();
  expect(contents(root)).toEqual(before);
});
