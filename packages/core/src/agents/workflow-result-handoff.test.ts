/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolResult } from '../tools/tools.js';
import { ApprovalMode } from '../policy/types.js';
import { AgentTerminateMode, SubagentState } from './types.js';
import { createSwarm, readSwarm } from './swarm.js';
import { createAgentWorkflow, readAgentWorkflow } from './agentWorkflows.js';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('./agent-tool.js', () => ({
  AgentTool: vi.fn().mockImplementation(() => ({ build: () => ({ execute }) })),
}));
import { ManageSwarmTool } from './swarmTools.js';
import { RunAgentWorkflowTool } from './agentWorkflowTools.js';

let root: string;
const diagnostic = 'OpenAI output token limit reached; response is incomplete.';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-workflow-handoff-'));
  // Actual local invocations omit error/result on caught failures so the UI can
  // render rich progress. The diagnostic lives in llmContent/recentActivity.
  const failure: ToolResult = {
    llmContent: `Subagent 'coder' failed. Error: ${diagnostic}`,
    returnDisplay: {
      isSubagentProgress: true,
      agentName: 'coder',
      state: SubagentState.ERROR,
      recentActivity: [
        {
          id: 'failure',
          type: 'thought',
          status: SubagentState.ERROR,
          content: `Error: ${diagnostic}`,
        },
      ],
    },
  };
  execute.mockResolvedValue(failure);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
function context(): AgentLoopContext {
  return {
    config: {
      storage: { getProjectTempDir: () => root },
      getTargetDir: () => root,
      getApprovalMode: () => ApprovalMode.YOLO,
      getAgentRegistry: () => ({ getDefinition: () => ({ kind: 'local' }) }),
    },
  } as unknown as AgentLoopContext;
}
const options = () => ({ abortSignal: new AbortController().signal });

it('hands a concrete caught executor error back through the native swarm board', async () => {
  const swarm = createSwarm(root, 'Deliver the report');
  const tool = new ManageSwarmTool(context(), {} as MessageBus);
  await tool
    .build({
      swarm_id: swarm.id,
      action: 'add',
      name: 'author',
      agent: 'coder',
      brief: 'Write only the assigned report.',
    })
    .execute(options());
  await tool.build({ swarm_id: swarm.id, action: 'wait' }).execute(options());
  const member = readSwarm(root, swarm.id).members[0];
  expect(member.state).toBe('paused');
  expect(member.result).toContain(diagnostic);
});

it('retains the same failure in blocked Boost/Teamwork stage reports', async () => {
  const workflow = createAgentWorkflow(
    root,
    'boost',
    'Deliver the report',
    'default',
  );
  const result = await new RunAgentWorkflowTool(context(), {} as MessageBus)
    .build({ workflow_id: workflow.id, review_files: [] })
    .execute(options());
  const saved = readAgentWorkflow(root, workflow.id);
  expect(result.error).toBeDefined();
  expect(saved.phase).toBe('blocked');
  expect(saved.reports).toHaveLength(2);
  expect(
    saved.reports.every(
      (report) => !report.completed && report.text.includes(diagnostic),
    ),
  ).toBe(true);
});

it('preserves a successful structured auditor verdict for the completion gate', async () => {
  const swarm = createSwarm(root, 'Review the delivered artifact');
  execute.mockResolvedValue({
    llmContent: 'Executor completion wrapper',
    returnDisplay: {
      isSubagentProgress: true,
      agentName: 'workflow-auditor',
      state: SubagentState.COMPLETED,
      terminateReason: AgentTerminateMode.GOAL,
      recentActivity: [],
      result: JSON.stringify({
        passed: true,
        summary: 'Inspected the artifact.',
        evidence: ['artifact.txt'],
      }),
    },
  } satisfies ToolResult);
  const tool = new ManageSwarmTool(context(), {} as MessageBus);
  await tool
    .build({
      swarm_id: swarm.id,
      action: 'add',
      name: 'verifier',
      agent: 'workflow-auditor',
      review_files: [],
      brief: 'Read the artifact and return a verdict.',
    })
    .execute(options());
  await tool.build({ swarm_id: swarm.id, action: 'wait' }).execute(options());
  await tool.build({ swarm_id: swarm.id, action: 'finish' }).execute(options());
  expect(readSwarm(root, swarm.id).phase).toBe('completed');
});
