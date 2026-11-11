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
export const swarmResultArchiveSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(maxBytes),
  chars: z.number().int().positive().max(maxBytes),
});
type Archive = z.infer<typeof swarmResultArchiveSchema>;
type MemberText = { result: string; fullResult?: Archive };
const digest = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');

export function swarmResultArchivePath(
  root: string,
  id: string,
  value: Archive,
): string {
  z.string().uuid().parse(id);
  const archive = swarmResultArchiveSchema.parse(value);
  return path.join(root, 'swarms', id, 'results', `full-${archive.sha256}.md`);
}

export function readSwarmResultText(
  root: string,
  id: string,
  member: MemberText,
): string {
  if (!member.fullResult) return member.result;
  const archive = swarmResultArchiveSchema.parse(member.fullResult);
  const file = swarmResultArchivePath(root, id, archive);
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
      'Full swarm member result is missing or changed. Preserve it and restore the original; the preview cannot replace the full result.',
    );
  }
}

/** Bound the state record; never silently discard a member's accepted output. */
export function saveSwarmResultText(
  root: string,
  id: string,
  text: string,
): MemberText {
  if (text.length <= 12000) return { result: text };
  const data = Buffer.from(text, 'utf8');
  if (data.length > maxBytes)
    throw new Error(
      'Swarm member result exceeds the 8 MiB archive limit; result not accepted or silently truncated.',
    );
  const canonical = data.toString('utf8');
  const fullResult = {
    sha256: digest(data),
    bytes: data.length,
    chars: canonical.length,
  };
  const file = swarmResultArchivePath(root, id, fullResult);
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
    readSwarmResultText(root, id, { result: '', fullResult });
  }
  return {
    result: `${canonical.slice(0, 900)}\n[Preview only; full swarm member result archived.]\n${canonical.slice(-300)}`,
    fullResult,
  };
}

export function swarmResultPreview(
  root: string,
  id: string,
  member: MemberText,
) {
  const text = readSwarmResultText(root, id, member);
  if (!member.fullResult) return undefined;
  return {
    text: `${text.slice(0, 900)}\n[preview omitted; read fullText]\n${text.slice(-300)}`,
    truncated: true,
    fullText: swarmResultArchivePath(root, id, member.fullResult),
    ...member.fullResult,
  };
}
