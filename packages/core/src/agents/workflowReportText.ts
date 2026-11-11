/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

const maxBytes = 8 * 1024 * 1024;
export const workflowReportArchiveSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(maxBytes),
  chars: z.number().int().positive().max(maxBytes),
});
type Archive = z.infer<typeof workflowReportArchiveSchema>;
type ReportText = { text: string; fullText?: Archive };
const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');

export function workflowReportArchivePath(
  root: string,
  id: string,
  value: Archive,
): string {
  z.string().uuid().parse(id);
  const archive = workflowReportArchiveSchema.parse(value);
  return path.join(
    root,
    'agent-workflows',
    `${id}.reports`,
    `full-${archive.sha256}.md`,
  );
}

export function readWorkflowReportText(
  root: string,
  id: string,
  report: ReportText,
): string {
  if (!report.fullText) return report.text;
  const archive = workflowReportArchiveSchema.parse(report.fullText);
  const file = workflowReportArchivePath(root, id, archive);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== archive.bytes)
      throw new Error('invalid file');
    const data = fs.readFileSync(file);
    const text = data.toString('utf8');
    if (
      data.length !== archive.bytes ||
      digest(data) !== archive.sha256 ||
      text.length !== archive.chars
    )
      throw new Error('invalid content');
    return text;
  } catch {
    throw new Error(
      'Full stage report archive is missing or changed. Preserve it and restore the original; the preview cannot replace the full report.',
    );
  }
}

/** Keep bounded state while preserving every accepted byte of a long stage result. */
export function saveWorkflowReportText(
  root: string,
  id: string,
  text: string,
): ReportText {
  if (text.length <= 16000) return { text };
  const data = Buffer.from(text, 'utf8');
  if (data.length > maxBytes)
    throw new Error(
      'Stage report exceeds the 8 MiB archive limit; result not accepted or silently truncated.',
    );
  const canonical = data.toString('utf8');
  const fullText = {
    sha256: digest(data),
    bytes: data.length,
    chars: canonical.length,
  };
  const file = workflowReportArchivePath(root, id, fullText);
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
    readWorkflowReportText(root, id, { text: '', fullText });
  }
  return {
    text: `${canonical.slice(0, 900)}\n[Preview only; full stage report archived.]\n${canonical.slice(-300)}`,
    fullText,
  };
}
