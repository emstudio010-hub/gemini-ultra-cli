/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, afterEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { listAgentTasks } from './agentTaskCatalog.js';
import { createSwarm } from './swarm.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-task-catalog-'));
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
function workflow(mode = 'teamwork', id = randomUUID()) {
  const directory = path.join(root, 'agent-workflows');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, id + '.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      mode,
      objective: `Saved ${mode}`,
      brief: 'Original brief',
      phase: 'completed',
      previousApprovalMode: 'default',
      approved: true,
      milestones: [{ title: 'Task', acceptance: 'Artifact', completed: true }],
      reports: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  return { id, file };
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

it('lists all native task kinds without reading active bindings or migrating missing budgets', () => {
  for (const mode of ['boost', 'teamwork', 'grill-me']) workflow(mode);
  createSwarm(root, 'Saved swarm');
  fs.writeFileSync(path.join(root, 'agent-workflows/current.json'), '{broken');
  fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{broken');
  const before = contents(root);
  const catalog = listAgentTasks(root);
  expect(catalog.total).toBe(4);
  expect(new Set(catalog.entries.map((entry) => entry.mode))).toEqual(
    new Set(['boost', 'teamwork', 'grill-me', 'swarm']),
  );
  expect(
    catalog.entries.every(
      (entry) => entry.objective && !entry.detailsUnavailable,
    ),
  ).toBe(true);
  expect(contents(root)).toEqual(before);
});

it('paginates by saved time with no overlap and rejects invalid pages', () => {
  for (let index = 0; index < 22; index++) {
    const record = workflow();
    const time = new Date(1700000000000 + index * 1000);
    fs.utimesSync(record.file, time, time);
  }
  const first = listAgentTasks(root);
  const second = listAgentTasks(root, 2);
  expect(first.entries).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(second.entries).toHaveLength(2);
  expect(second.hasMore).toBe(false);
  expect(
    new Set([...first.entries, ...second.entries].map((entry) => entry.id))
      .size,
  ).toBe(22);
  expect(first.entries[0].savedAt > second.entries[0].savedAt).toBe(true);
  for (const page of [0, -1, 1.5, Number.NaN])
    expect(() => listAgentTasks(root, page)).toThrow();
});

it('keeps damaged records visible without echoing raw data or modifying them', () => {
  const { file, id } = workflow();
  fs.writeFileSync(file, '{SECRET_INVALID_PAYLOAD');
  const before = fs.readFileSync(file);
  const catalog = listAgentTasks(root);
  expect(catalog.entries).toMatchObject([
    { id, mode: 'workflow', detailsUnavailable: 'unreadable-record' },
  ]);
  expect(JSON.stringify(catalog)).not.toContain('SECRET_INVALID_PAYLOAD');
  expect(fs.readFileSync(file)).toEqual(before);
});

it('does not load a record beyond the page read budget', () => {
  const { file, id } = workflow();
  fs.truncateSync(file, 17 * 1024 * 1024);
  const catalog = listAgentTasks(root);
  expect(catalog.entries).toMatchObject([
    { id, detailsUnavailable: 'page-read-budget' },
  ]);
  expect(fs.statSync(file).size).toBe(17 * 1024 * 1024);
});

it('refuses a redirected catalog directory before listing another location', () => {
  const foreign = path.join(root, 'foreign');
  fs.mkdirSync(foreign);
  fs.symlinkSync(
    foreign,
    path.join(root, 'agent-workflows'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(() => listAgentTasks(root)).toThrow('regular project directory');
});
