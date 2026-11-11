/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readAgentWorkflow } from './agentWorkflows.js';
import { readSwarm, readSwarmBoard, type SwarmPost } from './swarm.js';
import { savedWorkflowBudgetSummary } from './workflowBudget.js';
import { workflowReportArchivePath } from './workflowReportText.js';
import { swarmResultArchivePath } from './swarmResultText.js';

export const agentTaskSelectionSchema = z
  .object({
    mode: z.enum(['teamwork', 'boost', 'grill-me', 'swarm']),
    id: z.string().uuid(),
  })
  .strict();

function regular(file: string, directory = false, maxBytes = 0): void {
  const info = fs.lstatSync(file);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (!directory && info.size > maxBytes)
  )
    throw new Error('Task data must be bounded regular project files.');
}

/** Bounded, read-only view. Never activates a budget or consults latest bindings. */
export function readAgentTaskDetails(root: string, selection: unknown) {
  const { mode, id } = agentTaskSelectionSchema.parse(selection);
  const common = {
    id,
    mode,
    commands: {
      status: `/${mode} status ${id}`,
      reports: `/${mode} reports ${id}`,
    },
  };
  const warnings: string[] = [];
  if (mode === 'swarm') {
    regular(path.join(root, 'swarms'), true);
    const directory = path.join(root, 'swarms', id);
    regular(directory, true);
    regular(path.join(directory, 'members.json'), false, 2 * 1024 * 1024);
    // The existing reader consults an optional owner record to recognize cancelled usage.
    try {
      regular(path.join(directory, 'owner.json'), false, 16384);
    } catch (error) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
      )
        throw error;
    }
    const record = readSwarm(root, id);
    let posts: SwarmPost[] = [];
    try {
      regular(path.join(directory, 'board.jsonl'), false, 4 * 1024 * 1024);
      posts = readSwarmBoard(root, id).slice(-12);
    } catch {
      warnings.push('board-unavailable');
    }
    const known = !record.accountingUnknown && record.budgetVersion === 1;
    if (!known) warnings.push('budget-unavailable');
    return {
      ...common,
      kind: 'swarm' as const,
      phase: record.phase,
      objective: record.objective.slice(0, 2000),
      revision: record.revision,
      stopReason: record.stopReason.slice(0, 2000),
      warnings,
      usage: {
        known,
        requests: known ? record.budget.requests : null,
        maxRequests: known ? record.budget.maxRequests : null,
      },
      members: record.members.map((member) => ({
        name: member.name,
        agent: member.agent,
        state: member.state,
        turns: member.turns,
        preview: member.result.slice(0, 1200),
        previewOnly: !!member.fullResult || member.result.length > 1200,
        fullResultPath: member.fullResult
          ? swarmResultArchivePath(root, id, member.fullResult)
          : undefined,
      })),
      posts: posts.map((post) => ({
        sender: post.sender.slice(0, 100),
        time: post.time.slice(0, 100),
        text: post.text.slice(0, 1200),
      })),
    };
  }
  const directory = path.join(root, 'agent-workflows');
  regular(directory, true);
  regular(path.join(directory, `${id}.json`), false, 8 * 1024 * 1024);
  const record = readAgentWorkflow(root, id);
  if (record.mode !== mode)
    throw new Error('The task mode does not match this record.');
  let usage: {
    known: boolean;
    requests: number | null;
    maxRequests: number | null;
  } = { known: false, requests: null, maxRequests: null };
  try {
    regular(path.join(directory, `${id}.budget.json`), false, 16384);
    const budget = savedWorkflowBudgetSummary(root, id);
    if (budget.mode !== mode) throw new Error('Budget mode mismatch.');
    usage = {
      known: !budget.accountingUnknown,
      requests: budget.requests,
      maxRequests: budget.maxRequests,
    };
  } catch {
    /* Missing or damaged legacy counters stay unknown, without migration. */
  }
  if (!usage.known) warnings.push('budget-unavailable');
  return {
    ...common,
    kind: 'workflow' as const,
    phase: record.phase,
    objective: record.objective.slice(0, 2000),
    stage: record.stage.slice(0, 200),
    approved: record.approved,
    warnings,
    usage,
    milestones: record.milestones.map((item) => ({
      title: item.title,
      completed: item.completed,
      acceptance: item.acceptance,
    })),
    reportCount: record.reports.length,
    reports: record.reports.slice(-4).map((report) => ({
      agent: report.agent.slice(0, 100),
      stage: report.stage.slice(0, 200),
      completed: report.completed,
      preview: report.text.slice(0, 1200),
      previewOnly: !!report.fullText || report.text.length > 1200,
      fullResultPath: report.fullText
        ? workflowReportArchivePath(root, id, report.fullText)
        : undefined,
    })),
  };
}
