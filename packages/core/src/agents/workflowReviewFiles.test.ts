/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import {
  createAgentWorkflow,
  readAgentWorkflow,
  saveAgentWorkflow,
  runAgentWorkflow,
} from './agentWorkflows.js';
import { readWorkflowReportText } from './workflowReportText.js';
import { workflowBudget, setWorkflowBudget } from './workflowBudget.js';
import { RunAgentWorkflowTool } from './agentWorkflowTools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ApprovalMode } from '../policy/types.js';

let root: string;
let workspace: string;
const raw = JSON.stringify({
  passed: true,
  summary: 'Checked final artifacts',
  evidence: ['REPORT.md'],
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-review-files-'));
  workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
});
afterEach(() => {
  expect(path.dirname(root)).toBe(os.tmpdir());
  expect(path.basename(root)).toMatch(/^ultra-workflow-review-files-/);
  fs.rmSync(root, { recursive: true, force: true });
});
it.each(['boost', 'teamwork'] as const)(
  'blocks %s if declared files change during the final audit while retaining the actual verdict',
  async (mode) => {
    const task = createAgentWorkflow(
      root,
      mode,
      'Deliver REPORT.md',
      'default',
    );
    task.approved = true;
    task.phase = 'ready';
    saveAgentWorkflow(root, task);
    setWorkflowBudget(root, task, {
      maxRequests: 24,
      maxFailedStages: mode === 'teamwork' ? 1 : 3,
      maxImplementationRounds: 2,
    });
    let finalCalls = 0;
    const result = await runAgentWorkflow(
      root,
      task.id,
      new AbortController().signal,
      async (agent, prompt) => {
        if (agent === 'coder')
          fs.writeFileSync(path.join(workspace, 'REPORT.md'), 'version A');
        if (prompt.includes('Audit the integrated deliverable')) {
          finalCalls++;
          fs.writeFileSync(path.join(workspace, 'REPORT.md'), 'version B');
        }
        return {
          completed: true,
          text: agent === 'workflow-auditor' ? raw : 'Scoped evidence',
        };
      },
      undefined,
      { workspace, files: ['REPORT.md'] },
    );
    expect(result.phase).toBe('blocked');
    expect(result.stage).toContain(
      mode === 'teamwork'
        ? 'failed-stage budget exhausted'
        : 'Declared final review files changed',
    );
    expect(result.milestones.at(-1)?.completed).toBe(false);
    expect(result.reviewedFiles).toBeUndefined();
    expect(finalCalls).toBe(1);
    expect(
      readWorkflowReportText(
        root,
        task.id,
        result.reports.findLast((report) => report.stage === 'final audit')!,
      ),
    ).toBe(raw);
    expect(result.reports.at(-1)).toMatchObject({
      agent: 'native-file-check',
      completed: false,
      text: expect.stringContaining('Declared final review files changed'),
    });
    expect(workflowBudget(root, result).failedStages).toBe(1);
  },
);

it('waits for later milestones to create final files and ignores unrelated changes during final audit', async () => {
  const task = createAgentWorkflow(
    root,
    'boost',
    'Deliver two final files',
    'default',
  );
  task.milestones = [
    { title: 'First file', acceptance: 'REPORT.md', completed: false },
    { title: 'Second file', acceptance: 'LATER.md', completed: false },
  ];
  saveAgentWorkflow(root, task);
  let writes = 0;
  const result = await runAgentWorkflow(
    root,
    task.id,
    new AbortController().signal,
    async (agent, prompt) => {
      expect(prompt).toContain('Declared final review files:');
      if (agent === 'coder')
        fs.writeFileSync(
          path.join(workspace, ++writes === 1 ? 'REPORT.md' : 'LATER.md'),
          'delivered',
        );
      if (prompt.includes('Audit the integrated deliverable'))
        fs.writeFileSync(path.join(workspace, 'unrelated.txt'), 'unrelated');
      return {
        completed: true,
        text: agent === 'workflow-auditor' ? raw : 'Scoped evidence',
      };
    },
    undefined,
    { workspace, files: ['REPORT.md', 'LATER.md'] },
  );
  expect(writes).toBe(2);
  expect(result.phase).toBe('completed');
  expect(result.reviewedFiles?.files).toHaveLength(2);
  expect(readAgentWorkflow(root, task.id).reviewFiles).toEqual([
    'REPORT.md',
    'LATER.md',
  ]);
});

it('allows an explicit member-report-only scope without claiming workspace files', async () => {
  const task = createAgentWorkflow(
    root,
    'boost',
    'Compare member reports only',
    'default',
  );
  const result = await runAgentWorkflow(
    root,
    task.id,
    new AbortController().signal,
    async (agent) => ({
      completed: true,
      text: agent === 'workflow-auditor' ? raw : 'Member report',
    }),
    undefined,
    { workspace, files: [] },
  );
  expect(result.phase).toBe('completed');
  expect(result.reviewFiles).toEqual([]);
  expect(result.reviewedFiles?.files).toEqual([]);
});

it('refuses to bind a saved task to a different workspace before calls or state mutations', async () => {
  const task = createAgentWorkflow(
    root,
    'boost',
    'Keep the original workspace',
    'default',
  );
  const original = path.join(root, 'original');
  fs.mkdirSync(original);
  task.workspace = fs.realpathSync.native(original);
  task.reviewFiles = [];
  saveAgentWorkflow(root, task);
  const file = path.join(root, 'agent-workflows', `${task.id}.json`);
  const before = fs.readFileSync(file);
  const beforeBudget = workflowBudget(root, task);
  let calls = 0;
  await expect(
    runAgentWorkflow(
      root,
      task.id,
      new AbortController().signal,
      async () => {
        calls++;
        return { completed: true, text: raw };
      },
      undefined,
      { workspace, files: [] },
    ),
  ).rejects.toThrow(/another workspace/);
  expect(calls).toBe(0);
  expect(fs.readFileSync(file)).toEqual(before);
  expect(workflowBudget(root, task)).toEqual(beforeBudget);
});

it('requires an explicit final file list in the public run tool before dispatching agents', () => {
  const task = createAgentWorkflow(
    root,
    'boost',
    'Require explicit final review scope',
    'default',
  );
  const context = {
    config: {
      storage: { getProjectTempDir: () => root },
      getTargetDir: () => workspace,
      getApprovalMode: () => ApprovalMode.DEFAULT,
    },
  } as unknown as AgentLoopContext;
  const tool = new RunAgentWorkflowTool(context, createMockMessageBus());
  const missing = { workflow_id: task.id } as Parameters<
    RunAgentWorkflowTool['build']
  >[0];
  expect(() => tool.build(missing)).toThrow(/review_files/);
  expect(readAgentWorkflow(root, task.id).phase).toBe('ready');
  expect(workflowBudget(root, task).requests).toBe(0);
});
