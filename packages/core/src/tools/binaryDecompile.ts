/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { checkBinary } from './drillTools.js';
import { ghidraDecompileScript } from './ghidraDecompileScript.js';
import {
  discoverGhidraDecompiler,
  discoverGhidraJava,
} from './ghidraRuntime.js';
import { ToolErrorType } from './tool-error.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';

const address = z.string().regex(/^(?:0x)?[0-9a-fA-F]{1,16}$/);
const inputSchema = z.object({
  filePath: z.string().trim().min(1),
  address: address.optional(),
  maxChars: z.number().int().min(1000).max(60000).default(20000),
});
export interface BinaryDecompileParams {
  filePath: string;
  /** Hexadecimal virtual address, with or without 0x. */
  address?: string;
  maxChars?: number;
}
const reportSchema = z.object({
  completed: z.literal(true),
  analysisTimedOut: z.literal(false),
  functionName: z.string().min(1),
  address,
  imageBase: address,
  language: z.string().min(1),
  compiler: z.string(),
  signature: z.string(),
  selection: z.enum(['requested-address', 'first-entrypoint-or-function']),
  code: z.string().min(1).max(1048576),
  diagnostics: z.string().nullable(),
});
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

/** Uses the installed Ghidra JVM entrypoint directly: no batch/shell quoting. */
export async function decompileBinary(
  params: BinaryDecompileParams,
  baseDirectory: string,
  artifactRoot: string,
  signal: AbortSignal,
  validateRead?: (file: string) => string | null,
) {
  const input = inputSchema.parse(params);
  signal.throwIfAborted();
  const samplePath = await fs.realpath(
    path.resolve(baseDirectory, input.filePath),
  );
  const denied = validateRead?.(samplePath);
  if (denied) throw new Error(denied);
  const info = await fs.stat(samplePath);
  if (!info.isFile() || info.size > 64 * 1024 * 1024)
    throw new Error('Select a regular local sample up to 64 MiB.');
  const bytes = await fs.readFile(samplePath);
  if (bytes.length > 64 * 1024 * 1024)
    throw new Error('Sample grew beyond the 64 MiB limit.');
  let installation = process.env['GEMINI_ULTRA_GHIDRA_HOME'];
  if (!installation) {
    const headless = checkBinary('analyzeHeadless');
    if (headless.available && headless.pathOrStatus)
      installation = path.dirname(path.dirname(headless.pathOrStatus));
  }
  if (!installation)
    throw new Error(
      'Set GEMINI_ULTRA_GHIDRA_HOME to the Ghidra installation directory, or configure GEMINI_ULTRA_TOOL_ANALYZEHEADLESS, then run /drill setup.',
    );
  const ghidraHome = await fs.realpath(installation);
  const utility = path.join(
    ghidraHome,
    'Ghidra/Framework/Utility/lib/Utility.jar',
  );
  await fs.access(utility);
  const nativeDecompiler = discoverGhidraDecompiler(ghidraHome);
  if (!nativeDecompiler.available)
    throw new Error(nativeDecompiler.pathOrStatus);
  const properties = await fs.readFile(
    path.join(ghidraHome, 'Ghidra/application.properties'),
    'utf8',
  );
  const version = properties.match(/^application.version=(.+)$/m)?.[1]?.trim();
  if (!version)
    throw new Error('Ghidra installation is missing application.version.');
  const discoveredJava = await discoverGhidraJava(() => checkBinary('java'));
  if (!discoveredJava.available || !discoveredJava.pathOrStatus)
    throw new Error(discoveredJava.pathOrStatus || 'No native Java found.');
  const java = discoveredJava.pathOrStatus;
  const launchProperties = await fs.readFile(
    path.join(ghidraHome, 'support/launch.properties'),
    'utf8',
  );
  const platform =
    process.platform === 'win32'
      ? 'WINDOWS'
      : process.platform === 'darwin'
        ? 'MACOS'
        : 'LINUX';
  const vmargs = launchProperties.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^VMARGS(?:_(WINDOWS|MACOS|LINUX))?=(.+)$/);
    return match && (!match[1] || match[1] === platform)
      ? [match[2].trim()]
      : [];
  });
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ultra-decompile-'));
  const artifactDirectory = path.join(
    artifactRoot,
    'decompilations',
    randomUUID(),
  );
  let artifactsCreated = false;
  let diagnostics = '';
  try {
    await fs.mkdir(artifactDirectory, { recursive: true });
    artifactsCreated = true;
    const snapshot = path.join(scratch, 'sample.bin');
    await fs.writeFile(snapshot, bytes, { mode: 0o600 });
    await fs.writeFile(
      path.join(scratch, 'UltraDecompile.java'),
      ghidraDecompileScript,
    );
    const project = path.join(scratch, 'project');
    await fs.mkdir(project);
    const output = path.join(scratch, 'result.json');
    await new Promise<void>((resolve, reject) => {
      execFile(
        java,
        [
          ...vmargs,
          '-Xmx1G',
          '-XX:ParallelGCThreads=2',
          '-XX:CICompilerCount=2',
          '-Djava.awt.headless=true',
          '-Dfile.encoding=UTF-8',
          `-Dapplication.settingsdir=${path.join(scratch, 'settings')}`,
          `-Dapplication.cachedir=${path.join(scratch, 'cache')}`,
          `-Dapplication.tempdir=${path.join(scratch, 'temp')}`,
          '-cp',
          utility,
          'ghidra.Ghidra',
          'ghidra.app.util.headless.AnalyzeHeadless',
          project,
          'UltraAnalysis',
          '-import',
          snapshot,
          '-analysisTimeoutPerFile',
          '60',
          '-max-cpu',
          '2',
          '-deleteProject',
          '-scriptPath',
          scratch,
          '-postScript',
          'UltraDecompile.java',
          output,
          input.address?.replace(/^0x/i, '') || 'entry',
        ],
        {
          cwd: baseDirectory,
          shell: false,
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          signal,
        },
        (error, stdout, stderr) => {
          diagnostics = `${stdout}\n${stderr}`;
          if (error)
            reject(
              new Error(
                'Ghidra did not finish within its process/output limits or the JDK/installation is incompatible. See analysis.log.',
              ),
            );
          else resolve();
        },
      );
    });
    signal.throwIfAborted();
    const outputInfo = await fs.stat(output).catch(() => undefined);
    if (!outputInfo || outputInfo.size > 2 * 1024 * 1024)
      throw new Error(
        'Ghidra produced no complete bounded function result. Inspect analysis.log for import, address, JDK or decompiler errors.',
      );
    const report = reportSchema.parse(
      JSON.parse(await fs.readFile(output, 'utf8')),
    );
    const codeArtifact = path.join(artifactDirectory, 'decompiled.c');
    const fullCode = report.code;
    const result = {
      ...report,
      code: fullCode.slice(0, input.maxChars),
      truncated: fullCode.length > input.maxChars,
      originalChars: fullCode.length,
      samplePath,
      sampleSha256: hash(bytes),
      sourceChangedDuringAnalysis:
        hash(await fs.readFile(samplePath)) !== hash(bytes),
      ghidraVersion: version,
      codeArtifact,
      codeSha256: hash(fullCode),
      codeLines: fullCode.split('\n').length,
      reportArtifact: path.join(artifactDirectory, 'report.json'),
      logArtifact: path.join(artifactDirectory, 'analysis.log'),
      scope:
        'One function recovered by Ghidra from a copied sample. Pseudocode is analyzer output, not original source or runtime verification. The target was not executed. Check addresses/image base and disassembly before drawing conclusions.',
    };
    await fs.writeFile(codeArtifact, fullCode, { mode: 0o600 });
    await fs.writeFile(result.reportArtifact, JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
    return result;
  } catch (error) {
    signal.throwIfAborted();
    const message = error instanceof Error ? error.message : String(error);
    const clues = diagnostics
      .split(/\r?\n/)
      .filter((line) => /ERROR|Exception|Caused by:/.test(line))
      .slice(-5)
      .join('\n')
      .slice(0, 1600);
    throw new Error(
      `${message}${clues ? `\n${clues}` : ''} Evidence directory: ${artifactDirectory}`,
    );
  } finally {
    try {
      if (artifactsCreated)
        await fs.writeFile(
          path.join(artifactDirectory, 'analysis.log'),
          diagnostics,
          { mode: 0o600 },
        );
    } finally {
      // Only our own generated analysis scratch directory is reclaimed.
      if (
        path.dirname(scratch) === os.tmpdir() &&
        path.basename(scratch).startsWith('ultra-decompile-')
      )
        await fs.rm(scratch, { recursive: true, force: true });
    }
  }
}

class BinaryDecompileInvocation extends BaseToolInvocation<
  BinaryDecompileParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BinaryDecompileParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Static Function Decompilation');
  }
  getDescription(): string {
    return `Decompiling ${this.params.address || 'entry function'} in ${this.params.filePath}`;
  }
  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      const result = await decompileBinary(
        this.params,
        this.config.getTargetDir(),
        this.config.storage.getProjectTempDir(),
        abortSignal,
        (file) => this.config.validatePathAccess(file, 'read'),
      );
      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: `✓ Ghidra ${result.functionName} @ ${result.address}${result.truncated ? ' (preview truncated)' : ''}\n${result.codeArtifact}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Binary decompilation failed: ${message}`,
        returnDisplay: message,
        error: { message, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}
export class BinaryDecompileTool extends BaseDeclarativeTool<
  BinaryDecompileParams,
  ToolResult
> {
  static readonly Name = 'binary_decompile';
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      BinaryDecompileTool.Name,
      'Static Function Decompilation',
      'Decompile one local function with installed Ghidra and a compatible JDK. The sample is copied, never executed or modified. Inspect binary metadata/functions first; address is a hexadecimal virtual address, not a file offset or expression. Without address selects an entrypoint/first function. Saves full C-like pseudocode, report, hashes and log in project artifacts; maxChars only limits the returned preview. Bounded to 120 seconds, 1 GiB heap and 64 MiB samples. Configure GEMINI_ULTRA_GHIDRA_HOME (installation root) and JAVA_HOME or GEMINI_ULTRA_TOOL_JAVA. Pseudocode is not original source or proof of runtime behavior.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Local sample path, workspace-relative or absolute.',
          },
          address: {
            type: 'string',
            pattern: '^(0x)?[0-9a-fA-F]{1,16}$',
            description:
              'Hexadecimal virtual function address, not a file offset. Optional 0x prefix.',
          },
          maxChars: {
            type: 'integer',
            minimum: 1000,
            maximum: 60000,
            description:
              'Returned pseudocode preview limit (default 20000); full artifact is retained.',
          },
        },
        required: ['filePath'],
      },
      messageBus,
      true,
      false,
    );
  }
  protected override validateToolParamValues(
    params: BinaryDecompileParams,
  ): string | null {
    const parsed = inputSchema.safeParse(params);
    return parsed.success
      ? null
      : parsed.error.issues.map((issue) => issue.message).join('; ');
  }
  protected createInvocation(
    params: BinaryDecompileParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new BinaryDecompileInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}
