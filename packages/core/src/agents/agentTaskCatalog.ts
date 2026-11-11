/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { readAgentWorkflow, type AgentWorkflowMode } from './agentWorkflows.js';
import { readSwarm } from './swarm.js';

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageSize = 20;
const readBudget = 16 * 1024 * 1024;
function missing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
export interface AgentTaskCatalogEntry {
  id: string;
  mode: AgentWorkflowMode | 'swarm' | 'workflow';
  savedAt: string;
  phase?: string;
  objective?: string;
  detailsUnavailable?: 'unreadable-record' | 'page-read-budget';
}

/** Read-only project catalog. Does not consult/change active bindings or budgets. */
export function listAgentTasks(root: string, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
    throw new Error('Page must be an integer from 1 to 1000000.');
  const candidates: Array<{
    id: string;
    kind: 'workflow' | 'swarm';
    file: string;
    time: number;
    size: number;
  }> = [];
  for (const kind of ['workflow', 'swarm'] as const) {
    const directory = path.join(
      root,
      kind === 'workflow' ? 'agent-workflows' : 'swarms',
    );
    let info: fs.Stats;
    try {
      info = fs.lstatSync(directory);
    } catch (error) {
      if (missing(error)) continue;
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(
        'Task catalog storage must be a regular project directory.',
      );
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const id =
        kind === 'workflow' ? entry.name.replace(/\.json$/, '') : entry.name;
      if (
        !idPattern.test(id) ||
        (kind === 'workflow'
          ? !entry.isFile() || entry.name !== `${id}.json`
          : !entry.isDirectory())
      )
        continue;
      const file =
        kind === 'workflow'
          ? path.join(directory, entry.name)
          : path.join(directory, entry.name, 'members.json');
      try {
        const stat = fs.lstatSync(file);
        if (stat.isFile() && !stat.isSymbolicLink())
          candidates.push({
            id,
            kind,
            file,
            time: stat.mtimeMs,
            size: stat.size,
          });
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
  }
  candidates.sort(
    (a, b) =>
      b.time - a.time ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
  let remaining = readBudget;
  const entries: AgentTaskCatalogEntry[] = candidates
    .slice((page - 1) * pageSize, page * pageSize)
    .map((candidate) => {
      const common = {
        id: candidate.id,
        mode: candidate.kind,
        savedAt: new Date(candidate.time).toISOString(),
      };
      if (candidate.size > remaining)
        return { ...common, detailsUnavailable: 'page-read-budget' };
      remaining -= candidate.size;
      try {
        const record =
          candidate.kind === 'workflow'
            ? readAgentWorkflow(root, candidate.id)
            : readSwarm(root, candidate.id);
        return {
          ...common,
          mode: 'mode' in record ? record.mode : 'swarm',
          phase: record.phase,
          objective: record.objective,
        };
      } catch {
        return { ...common, detailsUnavailable: 'unreadable-record' };
      }
    });
  return {
    page,
    pageSize,
    total: candidates.length,
    hasMore: page * pageSize < candidates.length,
    entries,
  };
}
