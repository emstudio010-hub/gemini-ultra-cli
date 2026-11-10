/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, expect, it, vi } from 'vitest';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolResult } from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import {
  AgentTerminateMode,
  SubagentState,
  type SubagentProgress,
} from './types.js';

const { build } = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('./agent-tool.js', () => ({
  AgentTool: vi.fn().mockImplementation(() => ({ build })),
}));
vi.mock('./ultraRuntime.js', () => ({
  readUltraRuntime: () => ({
    collaboration: 'team',
    maxParallel: 3,
    workflow: 'general',
  }),
  updateCollaborationTask: vi.fn(),
}));
import { SpawnSubagentsTool } from './spawn-subagents-tool.js';

beforeEach(() => {
  build.mockReset();
});

async function batch(results: ToolResult[]) {
  let index = 0;
  build.mockImplementation(() => ({ execute: async () => results[index++] }));
  const context = {
    config: {
      getSessionId: () => 'handoff-session',
      getAgentRegistry: () => ({ getDefinition: () => ({ kind: 'local' }) }),
    },
  } as unknown as AgentLoopContext;
  return new SpawnSubagentsTool(context, {} as MessageBus)
    .build({
      tasks: results.map((_, i) => ({
        agent_name: `agent-${i}`,
        prompt: 'Assigned task',
      })),
    })
    .execute({ abortSignal: new AbortController().signal });
}

function outcome(
  state: SubagentState,
  result: string,
  reason: AgentTerminateMode,
): ToolResult {
  const progress: SubagentProgress = {
    isSubagentProgress: true,
    agentName: 'agent',
    recentActivity: [],
    state,
    result,
    terminateReason: reason,
  };
  return {
    llmContent: [
      {
        text: `Subagent finished.\nTermination Reason: ${reason}\nResult:\n${result}`,
      },
    ],
    returnDisplay: progress,
  };
}

it('hands off readable results with truthful mixed outcomes and partial findings', async () => {
  const result = await batch([
    outcome(
      SubagentState.COMPLETED,
      JSON.stringify({ response: 'Implemented feature\nsrc/feature.ts:12' }),
      AgentTerminateMode.GOAL,
    ),
    outcome(
      SubagentState.ERROR,
      'Agent stopped (TIMEOUT). Partial result:\nEvidence retained',
      AgentTerminateMode.TIMEOUT,
    ),
    outcome(
      SubagentState.CANCELLED,
      'Cancelled by user',
      AgentTerminateMode.ABORTED,
    ),
  ]);
  expect(result.data).toMatchObject({ succeeded: 1, failed: 1, cancelled: 1 });
  expect(result.llmContent).toContain('1 completed, 1 failed, 1 cancelled');
  expect(result.llmContent).toContain('Implemented feature\nsrc/feature.ts:12');
  expect(result.llmContent).toContain('Termination Reason: TIMEOUT');
  expect(result.llmContent).toContain('Partial result:\nEvidence retained');
  expect(result.llmContent).toContain('(agent-1) FAILED');
  expect(result.llmContent).toContain('(agent-2) CANCELLED');
  expect(result.error).toBeUndefined();
  const unsuccessful = await batch([
    outcome(
      SubagentState.ERROR,
      'Partial evidence',
      AgentTerminateMode.MAX_TURNS,
    ),
  ]);
  expect(unsuccessful.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
});

it('preserves custom structured fields instead of treating every response property as a wrapper', async () => {
  const structured = JSON.stringify(
    { response: 'Conclusion', evidence: ['src/file.ts:8'], confidence: 0.5 },
    null,
    2,
  );
  const result = await batch([
    outcome(SubagentState.COMPLETED, structured, AgentTerminateMode.GOAL),
  ]);
  expect(result.llmContent).toContain(structured);
});

it('keeps non-text parts when a tool has no canonical subagent progress result', async () => {
  const media = {
    inlineData: { mimeType: 'application/octet-stream', data: 'AQID' },
  };
  const result = await batch([
    {
      llmContent: ['First part', { text: 'Second part' }, media],
      returnDisplay: 'Custom result',
    },
  ]);
  expect(result.llmContent).toContain('First part\nSecond part');
  expect(result.llmContent).toContain(JSON.stringify(media));
});
