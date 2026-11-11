/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createTwoFilesPatch } from 'diff';
import { DrillStore } from '../drill/drillStore.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { isSubpath } from '../utils/paths.js';

/** Canonicalize literal filesystem paths, including not-yet-created children. */
function canonicalPatchPath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
    let entry: fs.Stats | undefined;
    try {
      entry = fs.lstatSync(file);
    } catch (linkError) {
      if (
        !(linkError instanceof Error) ||
        !('code' in linkError) ||
        linkError.code !== 'ENOENT'
      )
        throw linkError;
    }
    if (entry?.isSymbolicLink())
      throw new Error(`Cannot patch a dangling symbolic link: ${file}`);
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(canonicalPatchPath(parent), path.basename(file));
  }
}

export interface BinaryTriageResult {
  samplePath: string;
  size: number;
  md5: string;
  sha256: string;
  fileType: string;
  entropy: number;
  isPacked: boolean;
  highRiskApis: string[];
  interestingStrings: string[];
}

export function calculateEntropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < buffer.length; i++) {
    frequencies[buffer[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const p = frequencies[i] / buffer.length;
      entropy -= p * Math.log2(p);
    }
  }
  return Number(entropy.toFixed(4));
}

export function detectBinaryFileType(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'PE (Windows Executable/DLL)';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return 'ELF (Linux Executable/Shared Object)';
  }
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xfe &&
      buffer[1] === 0xed &&
      buffer[2] === 0xfa &&
      (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
      (buffer[0] === 0xcf &&
        buffer[1] === 0xfa &&
        buffer[2] === 0xed &&
        buffer[3] === 0xfe))
  ) {
    return 'Mach-O (macOS/iOS)';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'ZIP/APK/JAR Container';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x64 &&
    buffer[1] === 0x65 &&
    buffer[2] === 0x78 &&
    buffer[3] === 0x0a
  ) {
    return 'DEX (Dalvik Executable)';
  }
  return 'Unknown/Raw Binary';
}

export function binaryTriage(
  filePath: string,
  sessionId?: string,
): BinaryTriageResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('The sample must be a regular file.');
  if (stat.size > 64 * 1024 * 1024)
    throw new Error(
      'The sample exceeds the 64 MiB inline triage limit. Use a dedicated reverse engineering tool for this file.',
    );
  const buffer = fs.readFileSync(resolved);

  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const entropy = calculateEntropy(buffer);
  const fileType = detectBinaryFileType(buffer);
  const isPacked = entropy > 7.1;

  const rawStr = buffer.toString('latin1');
  const matched = rawStr.match(/[A-Za-z0-9_\-.:/\\]{5,}/g) || [];

  const knownHighRisk = [
    'VirtualAlloc',
    'VirtualProtect',
    'WriteProcessMemory',
    'CreateRemoteThread',
    'OpenProcess',
    'IsDebuggerPresent',
    'CheckRemoteDebuggerPresent',
    'ptrace',
    'mprotect',
    'dlopen',
    'dlsym',
    'system',
    'execve',
    'win_inet',
    'InternetOpen',
  ];
  const foundApis = knownHighRisk.filter((api) => {
    if (api === 'system') {
      return matched.some(
        (m) =>
          m === 'system' ||
          m === '_system' ||
          m === 'systemA' ||
          m === 'msvcrt!system',
      );
    }
    return rawStr.includes(api);
  });

  const interestingStrings = matched
    .filter(
      (s) =>
        s.includes('http://') ||
        s.includes('https://') ||
        s.includes('.dll') ||
        s.includes('.so') ||
        s.includes('flag{'),
    )
    .slice(0, 30);

  const result: BinaryTriageResult = {
    samplePath: resolved,
    size: stat.size,
    md5,
    sha256,
    fileType,
    entropy,
    isPacked,
    highRiskApis: foundApis,
    interestingStrings,
  };

  if (sessionId) {
    try {
      DrillStore.getInstance().recordBinaryArtifact({
        sessionId,
        samplePath: resolved,
        sha256,
        md5,
        size: stat.size,
        fileType,
        entropy,
        isPacked,
        highRiskApis: foundApis,
        notes: `Triage complete. Interesting strings: ${interestingStrings.length}. API matches are string candidates, not verified imports; use binary_inspect to inspect the actual import table.`,
      });
    } catch {
      // Legacy direct triage remains usable when optional fact storage is unavailable.
    }
  }

  return result;
}

export interface PatchTransactionResult {
  originalFile: string;
  backupFile: string;
  modifiedFile: string;
  diffFile: string;
  verificationFile: string;
  rollbackScript: string;
  appliedToTarget: boolean;
}

export function verifiedPatchTransaction(params: {
  sessionId: string;
  targetFile: string;
  newContent?: string;
  hexPatchOffset?: number;
  hexPatchBytes?: string;
  applyToTarget?: boolean;
  validateWrite?: (file: string) => string | null;
}): PatchTransactionResult {
  const resolved = path.resolve(params.targetFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const applyInPlace = params.applyToTarget !== false;
  const timestamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.dirname(resolved);
  const ext = path.extname(resolved);
  const base = path.basename(resolved, ext);

  const backupFile = path.join(dir, `${base}.orig.${timestamp}${ext}`);
  const modifiedFile = path.join(dir, `${base}.patched.${timestamp}${ext}`);
  const diffFile = path.join(dir, `${base}.patch.${timestamp}.diff`);
  const verificationFile = path.join(
    dir,
    `${base}.VERIFICATION.${timestamp}.txt`,
  );
  const rollbackScript = path.join(dir, `rollback_${base}_${timestamp}.mjs`);

  for (const file of [
    resolved,
    backupFile,
    modifiedFile,
    diffFile,
    verificationFile,
    rollbackScript,
  ]) {
    const denied = params.validateWrite?.(canonicalPatchPath(file));
    if (denied) throw new Error(denied);
  }

  const origBuffer = fs.readFileSync(resolved);
  let patchedBuffer: Buffer;

  if (params.hexPatchBytes && params.hexPatchOffset !== undefined) {
    patchedBuffer = Buffer.from(origBuffer);
    const hex = params.hexPatchBytes.replace(/\s+/g, '');
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex))
      throw new Error(
        'hexPatchBytes must contain complete hexadecimal byte pairs.',
      );
    const patchBytes = Buffer.from(hex, 'hex');
    if (
      !Number.isSafeInteger(params.hexPatchOffset) ||
      params.hexPatchOffset < 0 ||
      params.hexPatchOffset + patchBytes.length > origBuffer.length
    )
      throw new Error(
        'The hex patch must fit entirely inside the original file.',
      );
    patchBytes.copy(patchedBuffer, params.hexPatchOffset);
  } else if (params.newContent !== undefined) {
    patchedBuffer = Buffer.from(params.newContent, 'utf8');
  } else {
    throw new Error(
      'Either newContent or hexPatchBytes + hexPatchOffset must be specified',
    );
  }

  fs.copyFileSync(resolved, backupFile);
  fs.writeFileSync(modifiedFile, patchedBuffer);

  const diffContent =
    params.newContent !== undefined
      ? createTwoFilesPatch(
          `a/${path.basename(resolved)}`,
          `b/${path.basename(resolved)}`,
          origBuffer.toString('utf8'),
          patchedBuffer.toString('utf8'),
        )
      : `Binary patch: ${path.basename(resolved)}\nOffset: ${params.hexPatchOffset}\nNew bytes: ${params.hexPatchBytes}\n`;
  fs.writeFileSync(diffFile, diffContent, 'utf8');

  const origSha = crypto.createHash('sha256').update(origBuffer).digest('hex');
  const patchSha = crypto
    .createHash('sha256')
    .update(patchedBuffer)
    .digest('hex');
  const report = [
    `=== Verified Patch Transaction ===`,
    `Date: ${new Date().toISOString()}`,
    `Target: ${resolved}`,
    `Backup: ${backupFile}`,
    `Original SHA-256: ${origSha}`,
    `Patched SHA-256:  ${patchSha}`,
    'Status: STAGED_VERIFIED',
  ].join('\n');
  fs.writeFileSync(verificationFile, report, 'utf8');

  const rollbackContent = `import { copyFileSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';\nimport { dirname, join } from 'node:path';\nconst directory = dirname(fileURLToPath(import.meta.url));\ncopyFileSync(join(directory, ${JSON.stringify(path.basename(backupFile))}), join(directory, ${JSON.stringify(path.basename(resolved))}));\nconsole.log('Rollback completed.');\n`;
  fs.writeFileSync(rollbackScript, rollbackContent, 'utf8');

  try {
    if (applyInPlace) {
      const targetTemp = `${resolved}.${timestamp}.tmp`;
      try {
        fs.writeFileSync(targetTemp, patchedBuffer, {
          mode: fs.statSync(resolved).mode,
        });
        fs.renameSync(targetTemp, resolved);
      } finally {
        if (fs.existsSync(targetTemp)) fs.unlinkSync(targetTemp);
      }
      const actualSha = crypto
        .createHash('sha256')
        .update(fs.readFileSync(resolved))
        .digest('hex');
      if (actualSha !== patchSha)
        throw new Error('Patched target verification failed.');
      fs.writeFileSync(
        verificationFile,
        report.replace('STAGED_VERIFIED', 'APPLIED_AND_VERIFIED'),
        'utf8',
      );
    }
    DrillStore.getInstance().recordPatchTransaction({
      sessionId: params.sessionId,
      originalPath: resolved,
      backupPath: backupFile,
      modifiedPath: modifiedFile,
      diffPath: diffFile,
      rollbackScript,
      status: applyInPlace ? 'applied' : 'staged',
    });
  } catch (error) {
    if (applyInPlace) fs.copyFileSync(backupFile, resolved);
    fs.appendFileSync(
      verificationFile,
      '\nStatus: FAILED; original target restored.\n',
    );
    throw error;
  }

  return {
    originalFile: resolved,
    backupFile,
    modifiedFile,
    diffFile,
    verificationFile,
    rollbackScript,
    appliedToTarget: applyInPlace,
  };
}

/**
 * Apply Codex V4A patch format (`*** Begin Patch` ... `*** End Patch`) across one or more files.
 */
export function applyCodexPatch(
  patchText: string,
  workspaceDir: string,
  validateAccess?: (file: string, check: 'read' | 'write') => string | null,
): {
  appliedFiles: string[];
  summary: string[];
} {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const appliedFiles: string[] = [];
  const summary: string[] = [];

  const checkedPath = (relative: string, operation: string): string => {
    const fullPath = path.resolve(workspaceDir, relative);
    const canonical = canonicalPatchPath(fullPath);
    if (validateAccess) {
      for (const check of operation === 'Update'
        ? (['read', 'write'] as const)
        : (['write'] as const)) {
        const denied = validateAccess(canonical, check);
        if (denied) throw new Error(denied);
      }
    } else if (
      !isSubpath(canonicalPatchPath(path.resolve(workspaceDir)), canonical)
    ) {
      throw new Error(`Path not in workspace: ${fullPath}`);
    }
    return fullPath;
  };
  // Check every operation before the first mkdir/write/unlink. Recheck when used.
  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File:(.*)$/.exec(line);
    if (header) checkedPath(header[2].trim(), header[1]);
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('*** Add File:')) {
      const relPath = line.replace('*** Add File:', '').trim();
      const fullPath = checkedPath(relPath, 'Add');
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('*** ')) {
        const l = lines[i];
        contentLines.push(l.startsWith('+') ? l.slice(1) : l);
        i++;
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, contentLines.join('\n'), 'utf8');
      appliedFiles.push(fullPath);
      summary.push(`Added ${relPath} (${contentLines.length} lines)`);
      continue;
    }

    if (line.startsWith('*** Delete File:')) {
      const relPath = line.replace('*** Delete File:', '').trim();
      const fullPath = checkedPath(relPath, 'Delete');
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        appliedFiles.push(fullPath);
        summary.push(`Deleted ${relPath}`);
      }
      i++;
      continue;
    }

    if (line.startsWith('*** Update File:')) {
      const relPath = line.replace('*** Update File:', '').trim();
      const fullPath = checkedPath(relPath, 'Update');
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Cannot update non-existent file: ${relPath}`);
      }
      let fileContent = fs
        .readFileSync(fullPath, 'utf8')
        .replace(/\r\n/g, '\n');
      i++;

      while (i < lines.length && !lines[i].startsWith('*** ')) {
        if (lines[i].startsWith('@@')) {
          i++;
          const oldChunk: string[] = [];
          const newChunk: string[] = [];
          while (
            i < lines.length &&
            !lines[i].startsWith('@@') &&
            !lines[i].startsWith('*** ')
          ) {
            const hl = lines[i];
            if (hl.startsWith('-')) {
              oldChunk.push(hl.slice(1));
            } else if (hl.startsWith('+')) {
              newChunk.push(hl.slice(1));
            } else if (hl.startsWith(' ')) {
              oldChunk.push(hl.slice(1));
              newChunk.push(hl.slice(1));
            } else {
              oldChunk.push(hl);
              newChunk.push(hl);
            }
            i++;
          }
          const targetBlock = oldChunk.join('\n');
          const replacementBlock = newChunk.join('\n');
          if (targetBlock && fileContent.includes(targetBlock)) {
            fileContent = fileContent.replace(targetBlock, replacementBlock);
          } else if (
            targetBlock.trim() &&
            fileContent.includes(targetBlock.trim())
          ) {
            fileContent = fileContent.replace(
              targetBlock.trim(),
              replacementBlock.trim(),
            );
          } else {
            throw new Error(
              `Hunk context mismatch in ${relPath} near:\n${targetBlock.slice(0, 120)}`,
            );
          }
        } else {
          i++;
        }
      }

      fs.writeFileSync(fullPath, fileContent, 'utf8');
      appliedFiles.push(fullPath);
      summary.push(`Updated ${relPath}`);
      continue;
    }

    i++;
  }

  return { appliedFiles, summary };
}

export interface BinaryTriageParams {
  filePath: string;
}

class BinaryTriageInvocation extends BaseToolInvocation<
  BinaryTriageParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BinaryTriageParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Binary Static Triage');
  }

  getDescription(): string {
    return `Running static triage on ${this.params.filePath}`;
  }

  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      abortSignal.throwIfAborted();
      const samplePath = fs.realpathSync(
        path.resolve(this.config.getTargetDir(), this.params.filePath),
      );
      const denied = this.config.validatePathAccess(samplePath, 'read');
      if (denied) throw new Error(denied);
      abortSignal.throwIfAborted();
      const res = binaryTriage(samplePath, this.config.getSessionId());
      return {
        llmContent: JSON.stringify(res, null, 2),
        returnDisplay: `✓ 样本静态初筛完成: ${res.fileType} | 熵值: ${res.entropy} (${res.isPacked ? '疑似加壳' : '未加壳'}) | SHA256: ${res.sha256.slice(0, 16)}...`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Binary triage error: ${msg}`,
        returnDisplay: `样本分析失败: ${msg}`,
        error: { message: msg, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

export class BinaryTriageTool extends BaseDeclarativeTool<
  BinaryTriageParams,
  ToolResult
> {
  static readonly Name = 'binary_triage';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      BinaryTriageTool.Name,
      'Binary Static Triage',
      'Performs static binary triage on a local file (PE/ELF/Mach-O/APK/DEX): computes hashes, Shannon entropy, packing heuristics, high-risk API string candidates (not verified imports), and interesting strings. Use binary_inspect to inspect actual binary structure and imports.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the binary file to inspect.',
          },
        },
        required: ['filePath'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: BinaryTriageParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new BinaryTriageInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}

export interface VerifiedPatchParams {
  targetFile: string;
  newContent?: string;
  hexPatchOffset?: number;
  hexPatchBytes?: string;
  applyToTarget?: boolean;
}

class VerifiedPatchInvocation extends BaseToolInvocation<
  VerifiedPatchParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: VerifiedPatchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(
      params,
      messageBus,
      toolName,
      'Verified Five-Piece Patch Transaction',
    );
  }

  getDescription(): string {
    return `Creating verified patch transaction for ${this.params.targetFile}`;
  }

  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      abortSignal.throwIfAborted();
      const targetFile = fs.realpathSync(
        path.resolve(this.config.getTargetDir(), this.params.targetFile),
      );
      for (const check of ['read', 'write'] as const) {
        const denied = this.config.validatePathAccess(targetFile, check);
        if (denied) throw new Error(denied);
      }
      abortSignal.throwIfAborted();
      const res = verifiedPatchTransaction({
        sessionId: this.config.getSessionId(),
        ...this.params,
        targetFile,
        validateWrite: (file) => this.config.validatePathAccess(file, 'write'),
      });
      const applyMsg = res.appliedToTarget
        ? '✓ 补丁事务已应用到目标文件并生成五件套备份:'
        : '✓ 补丁五件套已生成 (未直接写入目标文件):';
      return {
        llmContent: JSON.stringify(res, null, 2),
        returnDisplay: `${applyMsg}\n  目标文件: ${res.originalFile}\n  备份: ${res.backupFile}\n  修改副本: ${res.modifiedFile}\n  校验单: ${res.verificationFile}\n  回滚脚本: ${res.rollbackScript}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Patch transaction failed: ${msg}`,
        returnDisplay: `补丁事务失败: ${msg}`,
        error: { message: msg, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

export class VerifiedPatchTransactionTool extends BaseDeclarativeTool<
  VerifiedPatchParams,
  ToolResult
> {
  static readonly Name = 'verified_patch_transaction';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      VerifiedPatchTransactionTool.Name,
      'Verified Patch Transaction',
      'Executes a verified patch transaction with a backup, modified copy, actual diff, verification report and cross-platform Node rollback script (run with node). By default modifies targetFile after artifacts are saved, verifies its hash and restores the original on failure.',
      Kind.Edit,
      {
        type: 'object',
        properties: {
          targetFile: {
            type: 'string',
            description: 'Target file path to patch.',
          },
          newContent: {
            type: 'string',
            description: 'Optional new text content for the patched file.',
          },
          hexPatchOffset: {
            type: 'number',
            description: 'Optional byte offset for binary hex patching.',
          },
          hexPatchBytes: {
            type: 'string',
            description:
              'Optional hex string (e.g. "90 90") to patch at hexPatchOffset.',
          },
          applyToTarget: {
            type: 'boolean',
            description:
              'Whether to apply the patch directly to targetFile in place (default: true). Set to false to only generate staged copies without touching targetFile.',
          },
        },
        required: ['targetFile'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: VerifiedPatchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new VerifiedPatchInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}

export interface ApplyPatchParams {
  patch: string;
}

class ApplyPatchInvocation extends BaseToolInvocation<
  ApplyPatchParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ApplyPatchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Apply Multi-File V4A Patch');
  }

  getDescription(): string {
    return 'Applying Codex V4A multi-file patch';
  }

  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      abortSignal.throwIfAborted();
      const res = applyCodexPatch(
        this.params.patch,
        this.config.getTargetDir(),
        (file, check) => {
          abortSignal.throwIfAborted();
          return this.config.validatePathAccess(file, check);
        },
      );
      return {
        llmContent: `Applied patch to ${res.appliedFiles.length} file(s):\n${res.summary.join('\n')}`,
        returnDisplay: `✓ 已应用多文件补丁 (${res.appliedFiles.length} 个文件):\n${res.summary.join('\n')}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Failed to apply patch: ${msg}`,
        returnDisplay: `补丁应用失败: ${msg}`,
        error: { message: msg, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

export class ApplyPatchTool extends BaseDeclarativeTool<
  ApplyPatchParams,
  ToolResult
> {
  static readonly Name = 'apply_patch';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ApplyPatchTool.Name,
      'Apply V4A Patch',
      'Applies a Codex-style V4A multi-file patch (`*** Begin Patch`, `*** Add File:`, `*** Update File:`, `*** Delete File:`, `*** End Patch`).',
      Kind.Edit,
      {
        type: 'object',
        properties: {
          patch: {
            type: 'string',
            description:
              'Complete V4A patch string containing `*** Add File: <path>`, `*** Update File: <path>` with `@@` hunks, or `*** Delete File: <path>`.',
          },
        },
        required: ['patch'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ApplyPatchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new ApplyPatchInvocation(this.config, params, messageBus, toolName);
  }
}
