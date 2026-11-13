/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readAgentWorkflow, type AgentWorkflowMode } from './agentWorkflows.js';
import { readSwarm, readSwarmBoard } from './swarm.js';
import type { UiLocale } from '../i18n/i18nManager.js';
import { readWorkflowReportText } from './workflowReportText.js';
import { readSwarmResultText } from './swarmResultText.js';
import { readWorkflowReports } from './workflowReportHistory.js';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function literal(value: string): string {
  const fence = '`'.repeat(
    Math.max(
      3,
      ...[...value.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  return `${fence}text\n${value}\n${fence}`;
}
function writeUnchanged(file: string, content: string): void {
  try {
    fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
    if (
      fs.lstatSync(file).isSymbolicLink() ||
      fs.readFileSync(file, 'utf8') !== content
    )
      throw new Error(
        'Report snapshot file changed; preserve it and restore the original before exporting this snapshot again.',
      );
  }
}
type Entry = { label: string; text: string };
function publish(
  root: string,
  id: string,
  kind: string,
  phase: string,
  objective: string,
  snapshot: object,
  entries: Iterable<Entry>,
  sourcePath: string,
  locale: UiLocale,
  board?: string,
) {
  z.string().uuid().parse(id);
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const raw = JSON.stringify({ locale, ...snapshot }, null, 2);
  const snapshotSha256 = digest(raw);
  const directory = path.join(root, 'agent-reports', id, snapshotSha256);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const reports: Array<{
    file: string;
    label: string;
    sha256: string;
    bytes: number;
  }> = [];
  for (const entry of entries) {
    const report = {
      file: `${String(reports.length + 1).padStart(3, '0')}.md`,
      label: entry.label,
      sha256: digest(entry.text),
      bytes: Buffer.byteLength(entry.text),
    };
    writeUnchanged(path.join(directory, report.file), entry.text);
    reports.push(report);
  }
  writeUnchanged(path.join(directory, 'snapshot.json'), raw);
  if (board !== undefined)
    writeUnchanged(path.join(directory, 'board.jsonl'), board);
  const manifest = {
    id,
    kind,
    phase,
    locale,
    snapshotSha256,
    sourcePath,
    reports,
    ...(board !== undefined
      ? { board: { file: 'board.jsonl', sha256: digest(board) } }
      : {}),
    scope:
      'Local snapshot of saved task reports, not a new acceptance verdict. Full task text may contain private information. Referenced user files/tool artifacts are not copied or validated by export; original task records and permissions are unchanged.',
  };
  writeUnchanged(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  const links = reports
    .map(
      (report, index) =>
        `${index + 1}. [${report.file}](./${report.file})\n\n${literal(report.label)}\n`,
    )
    .join('\n');
  const index = `# ${kind} ${t('完整报告', 'reports')}\n\n${literal(`ID: ${id}\n${t('状态', 'Phase')}: ${phase}\n${t('原记录', 'Source')}: ${sourcePath}`)}\n\n## ${t('任务目标', 'Objective')}\n\n${literal(objective)}\n\n## ${t('已保存报告', 'Saved reports')}\n\n${links || t('尚未保存成员或阶段结果。', 'No member/stage result has been saved yet.')}\n\n[${t('原记录快照', 'Snapshot')}](./snapshot.json) · [${t('哈希与范围', 'Hashes and scope')}](./manifest.json)${board !== undefined ? ` · [${t('公开留言', 'Public board')}](./board.jsonl)` : ''}\n\n${t('导出保留原任务状态，包括受阻、取消和进行中状态；不会完成、恢复、批准或回写任务。引用的外部交付物和工具证据仍在原路径，本索引不复制或重新验证这些文件。任务正文可能含私人信息，由你决定是否分享。', 'Export preserves the saved phase, including blocked/cancelled/in-progress states. It does not complete, resume, approve or apply a task. External deliverables and evidence paths remain at their original locations; this is a report index, not a portable archive of those files. Keep private task content local unless you choose to share it.')}\n`;
  writeUnchanged(path.join(directory, 'index.md'), index);
  return {
    id,
    kind,
    phase,
    reportCount: reports.length,
    indexPath: path.join(directory, 'index.md'),
    manifestPath: path.join(directory, 'manifest.json'),
    snapshotSha256,
  };
}

export function exportWorkflowReports(
  root: string,
  id: string,
  expectedMode: AgentWorkflowMode,
  locale: UiLocale = 'en',
) {
  const record = readAgentWorkflow(root, id);
  if (record.mode !== expectedMode)
    throw new Error(
      `This ID belongs to /${record.mode}; use /${record.mode} reports ${id}.`,
    );
  function* entries(): Generator<Entry> {
    for (const report of readWorkflowReports(root, record))
      yield {
        label: `${report.stage} · ${report.agent} · completed=${report.completed}`,
        text: readWorkflowReportText(root, id, report),
      };
  }
  return publish(
    root,
    id,
    record.mode,
    record.phase,
    record.objective,
    { kind: record.mode, record },
    entries(),
    path.join(root, 'agent-workflows', `${id}.json`),
    locale,
  );
}
export function exportSwarmReports(
  root: string,
  id: string,
  locale: UiLocale = 'en',
) {
  const record = readSwarm(root, id);
  if (record.members.some((member) => member.failureHistoryIncomplete))
    throw new Error(
      'Failed attempt history is incomplete because archiving failed; preserve this task before exporting its available evidence.',
    );
  const board = readSwarmBoard(root, id);
  function* entries(): Generator<Entry> {
    for (const member of record.members)
      yield {
        label: `@${member.name} · ${member.agent} · ${member.state} · turns=${member.turns}`,
        text: readSwarmResultText(root, id, member),
      };
    // Keep existing current-member report positions stable, then append historical evidence.
    for (const member of record.members)
      for (const prior of member.pastResults ?? [])
        yield {
          label: `@${member.name} · ${member.agent} · historical saved result before turn ${prior.beforeTurn} · not a current verdict`,
          text: readSwarmResultText(root, id, {
            result: '',
            fullResult: prior.fullResult,
          }),
        };
    for (const member of record.members)
      for (const attempt of member.failedAttempts ?? [])
        yield {
          label: `@${member.name} · ${member.agent} · failed attempt turn ${attempt.turn} (${attempt.outcome}) · incomplete historical evidence, not a current verdict`,
          text: readSwarmResultText(root, id, {
            result: '',
            fullResult: attempt.fullResult,
          }),
        };
  }
  return publish(
    root,
    id,
    'swarm',
    record.phase,
    record.objective,
    { kind: 'swarm', record, board },
    entries(),
    path.join(root, 'swarms', id, 'members.json'),
    locale,
    board.map((post) => JSON.stringify(post)).join('\n') +
      (board.length ? '\n' : ''),
  );
}
