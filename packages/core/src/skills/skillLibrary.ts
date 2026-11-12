/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lockSync } from 'proper-lockfile';
import { z } from 'zod';
import { I18nManager } from '../i18n/i18nManager.js';
import type { UniversalSkillDomain } from './skillOrchestrator.js';

export interface SkillLibraryEntry {
  name: string;
  domain: UniversalSkillDomain;
  badge: string;
  tags: string[];
  mode: 'tagged' | 'native-passthrough';
  preferredModel?: string;
  preferredEffort?: string;
  updatedAt: string;
}

const maxBytes = 1024 * 1024;
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const nameSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (name) =>
      name.trim() === name &&
      !reserved.has(name.toLowerCase()) &&
      !/\p{Cc}/u.test(name),
  );
const entrySchema = z
  .object({
    name: nameSchema,
    domain: z.enum([
      'design-ui',
      'multimedia-video',
      'security-reverse',
      'ai-workflow-mcp',
      'system-architecture',
      'specialized-domain',
    ]),
    badge: z.string().max(2048),
    tags: z.array(z.string().max(256)).max(64),
    mode: z.enum(['tagged', 'native-passthrough']),
    preferredModel: z.string().max(1024).optional(),
    preferredEffort: z.string().max(128).optional(),
    updatedAt: z.string().max(128),
  })
  .passthrough();
const registrySchema = z.record(entrySchema);

export class SkillLibraryError extends Error {}
function invalidLibrary(cause: unknown): SkillLibraryError {
  return new SkillLibraryError(
    I18nManager.getInstance().t(
      '技能标签库损坏或不可读，原文件已保留。请恢复配置后重试；也可仅允许本次使用技能。',
      'Skill metadata is damaged or unreadable. The original file was retained. Restore it and retry, or allow the skill once.',
    ),
    { cause },
  );
}
function registryPath(): string {
  return path.resolve(
    process.env['GEMINI_ULTRA_SKILL_LIBRARY_FILE'] ||
      path.join(os.homedir(), '.gemini', 'config', 'skill-tags.json'),
  );
}
function snapshot(file: string): {
  records: Record<string, SkillLibraryEntry>;
  bytes?: Buffer;
} {
  let descriptor: number | undefined;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
      throw new Error('Invalid metadata file');
    descriptor = fs.openSync(file, 'r');
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || info.size > maxBytes)
      throw new Error('Invalid metadata file');
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(
        descriptor,
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!count) break;
      length += count;
    }
    if (length > info.size) throw new Error('Metadata changed during read');
    const bytes = buffer.subarray(0, length);
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      Object.keys(parsed).some((key) => !nameSchema.safeParse(key).success)
    )
      throw new Error('Invalid metadata key');
    const records = registrySchema.parse(parsed);
    if (
      Object.entries(records).some(
        ([key, value]) => key !== value.name.toLowerCase(),
      )
    )
      throw new Error('Metadata key does not match skill name');
    return { records, bytes };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return { records: {} };
    throw invalidLibrary(error);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

/** Missing metadata is optional; reading it must not create global directories. */
export function loadSkillLibraryRegistry(): Record<string, SkillLibraryEntry> {
  return snapshot(registryPath()).records;
}
export function getSkillLibraryEntry(
  name: string,
): SkillLibraryEntry | undefined {
  const records = loadSkillLibraryRegistry();
  const key = name.toLowerCase();
  return Object.hasOwn(records, key) ? records[key] : undefined;
}

/** Read and merge under one lock; retain the exact previous bytes before replacing. */
export function registerSkillInLibrary(
  entry: Omit<SkillLibraryEntry, 'updatedAt'>,
): SkillLibraryEntry {
  const full = entrySchema.safeParse({
    ...entry,
    updatedAt: new Date().toISOString(),
  });
  if (!full.success) throw invalidLibrary(full.error);
  const file = registryPath();
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  let release: () => void;
  try {
    release = lockSync(
      path.join(fs.realpathSync(directory), path.basename(file)),
      { realpath: false, retries: 0, stale: 30000 },
    );
  } catch (cause) {
    throw new SkillLibraryError(
      I18nManager.getInstance().t(
        '技能标签库正在被其他进程保存。本次未写入，请稍后重试。',
        'Another process is saving skill metadata. Nothing was written; retry shortly.',
      ),
      { cause },
    );
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const before = snapshot(file);
    const records = {
      ...before.records,
      [full.data.name.toLowerCase()]: full.data,
    };
    const content = JSON.stringify(records, null, 2);
    if (Buffer.byteLength(content) > maxBytes)
      throw new SkillLibraryError(
        I18nManager.getInstance().t(
          '技能标签库超过 1 MiB，本次未保存。',
          'Skill metadata exceeds 1 MiB; nothing was saved.',
        ),
      );
    fs.writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    // Cooperating writers use the lock; detect an editor changing the file too.
    const latest = snapshot(file).bytes;
    if (before.bytes ? !latest?.equals(before.bytes) : latest !== undefined)
      throw new SkillLibraryError(
        I18nManager.getInstance().t(
          '技能标签库已被其他进程修改。本次未保存，请重试。',
          'Skill metadata changed in another process. Nothing was saved; retry.',
        ),
      );
    if (before.bytes)
      fs.writeFileSync(`${file}.${randomUUID()}.bak`, before.bytes, {
        flag: 'wx',
        mode: 0o600,
      });
    fs.renameSync(temporary, file);
    return full.data;
  } catch (cause) {
    if (cause instanceof SkillLibraryError) throw cause;
    throw new SkillLibraryError(
      I18nManager.getInstance().t(
        '技能标签未保存，原文件已保留。请检查配置写入权限后重试。',
        'Skill metadata was not saved. The original file was retained; check write permissions and retry.',
      ),
      { cause },
    );
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } finally {
      release();
    }
  }
}
