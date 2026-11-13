/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { createAgentWorkflow, saveAgentWorkflow } from './agentWorkflows.js';
import { createSwarm, readSwarm } from './swarm.js';
import { consumeWorkflowRequest } from './workflowBudget.js';
import { exportWorkflowReports, exportSwarmReports } from './agentReports.js';
import {
  saveWorkflowReportText,
  workflowReportArchivePath,
} from './workflowReportText.js';
import {
  saveSwarmResultText,
  swarmResultArchivePath,
} from './swarmResultText.js';

let root: string;
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-reports-test-'));
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
it('exports all full Unicode stage results including blocked/failure records without changing source or budget', () => {
  const record = createAgentWorkflow(
    root,
    'boost',
    'Keep user constraints ``` and [untrusted label](https://example.invalid)',
    'default',
  );
  consumeWorkflowRequest(root);
  record.phase = 'blocked';
  record.reports = Array.from({ length: 6 }, (_, index) => ({
    agent: index % 2 ? 'workflow-auditor' : 'coder',
    stage: `stage ${index}`,
    completed: index !== 4,
    text: `报告 ${index}\n` + '证据'.repeat(7000) + '\nUNTRUNCATED_TAIL',
  }));
  saveAgentWorkflow(root, record);
  const source = path.join(root, 'agent-workflows', `${record.id}.json`);
  const ledger = source.replace('.json', '.budget.json');
  const before = fs.readFileSync(source);
  const budget = fs.readFileSync(ledger);
  const exported = exportWorkflowReports(root, record.id, 'boost');
  expect(exported).toMatchObject({ phase: 'blocked', reportCount: 6 });
  expect(fs.readFileSync(source)).toEqual(before);
  expect(fs.readFileSync(ledger)).toEqual(budget);
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
  for (const [index, entry] of manifest.reports.entries()) {
    const text = fs.readFileSync(
      path.join(path.dirname(exported.indexPath), entry.file),
      'utf8',
    );
    expect(text).toBe(record.reports[index].text);
    expect(hash(text)).toBe(entry.sha256);
  }
  expect(fs.readFileSync(exported.indexPath, 'utf8')).toContain(
    'Phase: blocked',
  );
  expect(exportWorkflowReports(root, record.id, 'boost')).toEqual(exported);
  const chinese = exportWorkflowReports(root, record.id, 'boost', 'zh');
  expect(chinese.indexPath).not.toBe(exported.indexPath);
  expect(fs.readFileSync(chinese.indexPath, 'utf8')).toContain('完整报告');
  expect(fs.readFileSync(source)).toEqual(before);
  const content = path.join(path.dirname(exported.indexPath), '001.md');
  fs.writeFileSync(content, 'user annotated copy');
  expect(() => exportWorkflowReports(root, record.id, 'boost')).toThrow(
    'snapshot file changed',
  );
  expect(fs.readFileSync(content, 'utf8')).toBe('user annotated copy');
  expect(() => exportWorkflowReports(root, record.id, 'teamwork')).toThrow(
    'belongs to /boost',
  );
});
it('retains cancelled Swarm member results and exact saved public-board records without reviving the task', () => {
  const swarm = createSwarm(root, 'Preserve cancelled evidence');
  const source = path.join(root, 'swarms', swarm.id, 'members.json');
  const record = readSwarm(root, swarm.id);
  record.phase = 'cancelled';
  record.members = [
    {
      name: 'author',
      agent: 'coder',
      brief: 'Write a report',
      state: 'killed',
      lastRead: 0,
      turns: 1,
      result: 'partial\n完整中段\n```\nnot accepted',
      modelsUsed: [],
    },
  ];
  fs.writeFileSync(source, JSON.stringify(record));
  const board = path.join(root, 'swarms', swarm.id, 'board.jsonl');
  const savedBoard = fs.readFileSync(board);
  const before = fs.readFileSync(source);
  const exported = exportSwarmReports(root, swarm.id);
  expect(exported).toMatchObject({ phase: 'cancelled', reportCount: 1 });
  expect(
    fs.readFileSync(
      path.join(path.dirname(exported.indexPath), '001.md'),
      'utf8',
    ),
  ).toBe(record.members[0].result);
  expect(fs.readFileSync(source)).toEqual(before);
  expect(fs.readFileSync(board)).toEqual(savedBoard);
  const snapshot = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(exported.indexPath), 'snapshot.json'),
      'utf8',
    ),
  );
  expect(snapshot.record.phase).toBe('cancelled');
  expect(snapshot.record.members[0].state).toBe('killed');
  expect(snapshot.board.length).toBeGreaterThan(0);
});
it('exports an empty interview and rejects invalid or damaged IDs without generating invented reports', () => {
  const interview = createAgentWorkflow(
    root,
    'grill-me',
    'Clarify requirements',
    'plan',
  );
  const exported = exportWorkflowReports(root, interview.id, 'grill-me');
  expect(exported.reportCount).toBe(0);
  expect(exported.phase).toBe('scoping');
  expect(fs.readFileSync(exported.indexPath, 'utf8')).toContain(
    'No member/stage result',
  );
  expect(() => exportWorkflowReports(root, '../escape', 'boost')).toThrow();
  fs.writeFileSync(
    path.join(root, 'agent-workflows', `${interview.id}.json`),
    '{broken record',
  );
  expect(() => exportWorkflowReports(root, interview.id, 'grill-me')).toThrow(
    'damaged',
  );
});

it.each(['workflow', 'swarm'] as const)(
  'writes %s reports incrementally and never publishes a complete index when a later archive is damaged',
  (kind) => {
    const original = 'First complete Unicode evidence 完整证据\n'.repeat(600);
    const later = 'Later long evidence\n'.repeat(1000);
    let id: string;
    let source: string;
    let archive: string;
    let execute: () => unknown;
    if (kind === 'workflow') {
      const record = createAgentWorkflow(
        root,
        'boost',
        'Export in bounded memory',
        'default',
      );
      record.reports = [original, later].map((text, index) => ({
        agent: 'researcher',
        stage: `stage ${index}`,
        completed: false,
        ...saveWorkflowReportText(root, record.id, text),
      }));
      saveAgentWorkflow(root, record);
      id = record.id;
      source = path.join(root, 'agent-workflows', id + '.json');
      archive = workflowReportArchivePath(
        root,
        id,
        record.reports[1].fullText!,
      );
      execute = () => exportWorkflowReports(root, id, 'boost');
    } else {
      const record = createSwarm(root, 'Export in bounded memory');
      const saved = readSwarm(root, record.id);
      saved.members = [original, later].map((text, index) => ({
        name: `reader-${index}`,
        agent: 'researcher' as const,
        brief: 'Saved evidence',
        state: 'paused' as const,
        lastRead: 0,
        turns: 1,
        modelsUsed: [],
        ...saveSwarmResultText(root, record.id, text),
      }));
      id = record.id;
      source = path.join(root, 'swarms', id, 'members.json');
      fs.writeFileSync(source, JSON.stringify(saved));
      archive = swarmResultArchivePath(root, id, saved.members[1].fullResult!);
      execute = () => exportSwarmReports(root, id);
    }
    fs.writeFileSync(archive, 'External archive change');
    const before = fs.readFileSync(source);
    expect(execute).toThrow(/missing or changed/);
    const exports = path.join(root, 'agent-reports', id);
    const snapshots = fs.readdirSync(exports);
    expect(snapshots).toHaveLength(1);
    const directory = path.join(exports, snapshots[0]);
    expect(fs.readFileSync(path.join(directory, '001.md'), 'utf8')).toBe(
      original,
    );
    expect(fs.existsSync(path.join(directory, '002.md'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'index.md'))).toBe(false);
    expect(fs.readFileSync(source)).toEqual(before);
    expect(fs.readFileSync(archive, 'utf8')).toBe('External archive change');
  },
);
