/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { workflowReportArchiveSchema } from './workflowReportText.js';

export const workflowStageReportSchema = z.object({
  agent: z.string(),
  stage: z.string(),
  completed: z.boolean(),
  text: z.string().max(16000),
  fullText: workflowReportArchiveSchema.optional(),
  modelsUsed: z.array(z.string().max(512)).max(16).optional(),
});
const maxBytes = 8 * 1024 * 1024;
const batchSchema = z.array(workflowStageReportSchema).length(100);
const referenceSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(maxBytes),
  count: z.literal(100),
});
export const workflowReportHistorySchema = z
  .array(referenceSchema)
  .max(128)
  .optional();
type Report = z.infer<typeof workflowStageReportSchema>;
type Reference = z.infer<typeof referenceSchema>;
type Record = { id: string; reports: Report[]; reportHistory?: Reference[] };
const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');
const failure =
  'Earlier stage report history is missing or changed. Preserve it and restore the original; recent previews cannot replace it.';
function historyPath(root: string, id: string, reference: Reference): string {
  z.string().uuid().parse(id);
  referenceSchema.parse(reference);
  return path.join(
    root,
    'agent-workflows',
    `${id}.reports`,
    `history-${reference.sha256}.json`,
  );
}
function readBatch(root: string, id: string, reference: Reference): Report[] {
  const file = historyPath(root, id, reference);
  try {
    const info = fs.lstatSync(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== reference.bytes
    )
      throw new Error(failure);
    const data = fs.readFileSync(file);
    if (data.length !== reference.bytes || digest(data) !== reference.sha256)
      throw new Error(failure);
    return batchSchema.parse(JSON.parse(data.toString('utf8')));
  } catch {
    throw new Error(failure);
  }
}

/** Archive complete batches before replacing the bounded recent state. Never delete history. */
export function appendWorkflowReport(
  root: string,
  record: Record,
  report: Report,
): void {
  const next = workflowStageReportSchema.parse(report);
  if (record.reports.length < 100) {
    record.reports.push(next);
    return;
  }
  if ((record.reportHistory?.length ?? 0) >= 128)
    throw new Error(
      'Stage report history limit reached; preserve this task and create a scoped successor.',
    );
  const data = Buffer.from(
    JSON.stringify(batchSchema.parse(record.reports)),
    'utf8',
  );
  const reference = referenceSchema.parse({
    sha256: digest(data),
    bytes: data.length,
    count: 100,
  });
  const file = historyPath(root, record.id, reference);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
    readBatch(root, record.id, reference);
  }
  record.reportHistory = [...(record.reportHistory ?? []), reference];
  record.reports = [next];
}

export function workflowReportCount(record: Record): number {
  return (
    record.reports.length +
    (record.reportHistory ?? []).reduce(
      (count, reference) => count + reference.count,
      0,
    )
  );
}
/** Lightweight pointers for model handoff; does not load old reports or their full text. */
export function workflowReportHistoryIndex(root: string, record: Record) {
  return (record.reportHistory ?? []).map((reference) => ({
    ...reference,
    file: historyPath(root, record.id, reference),
  }));
}
/** Validate one bounded batch at a time without retaining all old stage metadata. */
export function validateWorkflowReportHistory(
  root: string,
  record: Record,
): void {
  for (const reference of record.reportHistory ?? [])
    readBatch(root, record.id, reference);
}
/** Explicit full export includes every immutable metadata batch. */
export function readWorkflowReports(root: string, record: Record): Report[] {
  return [
    ...(record.reportHistory ?? []).flatMap((reference) =>
      readBatch(root, record.id, reference),
    ),
    ...record.reports,
  ];
}
