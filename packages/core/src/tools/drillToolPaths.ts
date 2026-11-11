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

export const drillToolNames = [
  'r2',
  'rabin2',
  'jadx',
  'java',
  'analyzeHeadless',
  'ghidra',
  'radare2',
  'frida',
  'nuclei',
  'fscan',
  'gogo',
  'python3',
  'python',
  'gdb',
  'lldb',
] as const;
const toolName = z.enum(drillToolNames);
const schema = z
  .object({
    version: z.literal(1),
    paths: z.record(toolName, z.string().min(1).max(32768)),
  })
  .strict();
const maxBytes = 128 * 1024;
export function drillToolPathsFile(): string {
  return (
    process.env['GEMINI_ULTRA_TOOLS_FILE'] ||
    path.join(os.homedir(), '.gemini', 'ultra-tools.json')
  );
}
function read() {
  const file = drillToolPathsFile();
  try {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return { version: 1 as const, paths: {} };
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
      throw new Error('invalid file');
    const data = schema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (Object.values(data.paths).some((value) => !path.isAbsolute(value)))
      throw new Error('relative tool path');
    return data;
  } catch {
    throw new Error(
      `Tool path configuration is damaged or unreadable: ${file}. Original file retained; restore it before saving or resetting paths.`,
    );
  }
}
export function savedDrillToolPaths() {
  return { file: drillToolPathsFile(), ...read() };
}
export function configuredDrillToolPath(name: string): {
  path?: string;
  source?: string;
  error?: string;
} {
  const variable = `GEMINI_ULTRA_TOOL_${name.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
  const explicit = process.env[variable];
  if (explicit) return { path: explicit, source: variable };
  const parsed = toolName.safeParse(name);
  if (!parsed.success) return {};
  try {
    const selected = read().paths[parsed.data];
    return selected ? { path: selected, source: drillToolPathsFile() } : {};
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Tool path configuration could not be read.',
    };
  }
}
export function saveDrillToolPath(name: string, selected?: string) {
  const key = toolName.parse(name);
  let resolved: string | undefined;
  if (selected !== undefined) {
    if (!path.isAbsolute(selected) || selected.includes('\0'))
      throw new Error(
        'Use the complete absolute path of a local executable file.',
      );
    resolved = path.resolve(selected);
    if (
      ['r2', 'rabin2', 'java'].includes(key) &&
      /\.(cmd|bat)$/i.test(resolved)
    )
      throw new Error(
        `Select a native executable for ${key}, not a batch wrapper.`,
      );
    try {
      if (!fs.statSync(resolved).isFile()) throw new Error('not a file');
      fs.accessSync(
        resolved,
        process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
      );
    } catch {
      throw new Error(
        `Tool path is unavailable or not executable: ${resolved}`,
      );
    }
  }
  // Check before mkdir/lock so malformed user data is preserved on every command.
  read();
  const file = drillToolPathsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const release = lockSync(file, { realpath: false, retries: 0 });
  let backup: string | undefined;
  try {
    const original = read();
    const next = { version: 1 as const, paths: { ...original.paths } };
    if (resolved) next.paths[key] = resolved;
    else delete next.paths[key];
    if (JSON.stringify(next) === JSON.stringify(original))
      return { ...savedDrillToolPaths(), backup };
    const content = JSON.stringify(schema.parse(next), null, 2) + '\n';
    if (Buffer.byteLength(content) > maxBytes)
      throw new Error(
        'Tool path configuration exceeds 128 KiB; nothing was saved.',
      );
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
      if (fs.existsSync(file)) {
        backup = `${file}.${randomUUID()}.bak`;
        fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup, 0o600);
      }
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    return { ...savedDrillToolPaths(), backup };
  } finally {
    release();
  }
}
