/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { checkBinary } from './drillTools.js';
import { ToolErrorType } from './tool-error.js';
import { parseNativeBinaryJson } from './nativeBinaryJson.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';

const inspectSchema = z.object({
  filePath: z.string().trim().min(1),
  view: z
    .enum(['info', 'imports', 'sections', 'libraries', 'symbols'])
    .default('info'),
  maxItems: z.number().int().min(1).max(1000).default(200),
});
export interface BinaryInspectParams {
  filePath: string;
  view?: 'info' | 'imports' | 'sections' | 'libraries' | 'symbols';
  maxItems?: number;
}
const viewFlags = {
  info: '-Ij',
  imports: '-ij',
  sections: '-Sj',
  libraries: '-lj',
  symbols: '-sj',
} as const;
const viewKeys = {
  info: 'info',
  imports: 'imports',
  sections: 'sections',
  libraries: 'libs',
  symbols: 'symbols',
} as const;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20000;

export async function inspectBinary(
  params: BinaryInspectParams,
  baseDirectory: string,
  abortSignal: AbortSignal,
  validateRead?: (file: string) => string | null,
): Promise<{
  samplePath: string;
  toolPath: string;
  view: string;
  data: unknown;
  returnedItems?: number;
  totalItems?: number;
  truncated: boolean;
  diagnostics?: string;
}> {
  const input = inspectSchema.parse(params);
  abortSignal.throwIfAborted();
  const samplePath = await realpath(
    path.resolve(baseDirectory, input.filePath),
  );
  const denied = validateRead?.(samplePath);
  if (denied) throw new Error(denied);
  if (!(await stat(samplePath)).isFile())
    throw new Error('The target must be a regular local file.');
  const discovered = checkBinary('rabin2');
  if (!discovered.available || !discovered.pathOrStatus) {
    throw new Error(
      'rabin2 is unavailable. Install radare2, add rabin2 to PATH or set GEMINI_ULTRA_TOOL_RABIN2 to its executable path, then run /drill setup.',
    );
  }
  const toolPath = discovered.pathOrStatus;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(toolPath)) {
    throw new Error(
      'binary_inspect needs the native rabin2.exe on Windows. Set GEMINI_ULTRA_TOOL_RABIN2 to that executable instead of a batch wrapper.',
    );
  }
  abortSignal.throwIfAborted();
  let stdout: string;
  let stderr: string;
  try {
    ({ stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          toolPath,
          [viewFlags[input.view], samplePath],
          {
            cwd: baseDirectory,
            encoding: 'utf8',
            shell: false,
            windowsHide: true,
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT_BYTES,
            signal: abortSignal,
          },
          (error, output, diagnostics) => {
            if (error) reject(error);
            else resolve({ stdout: output, stderr: diagnostics });
          },
        );
      },
    ));
  } catch (error) {
    if (abortSignal.aborted) throw new Error('Binary inspection cancelled.');
    const failure = z
      .object({
        code: z.union([z.number(), z.string()]).optional(),
        killed: z.boolean().optional(),
      })
      .safeParse(error);
    if (
      failure.success &&
      failure.data.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
    ) {
      throw new Error(
        'rabin2 output exceeded 4 MiB. Select a smaller view or use a dedicated analysis session; no partial JSON is reported as complete.',
      );
    }
    if (failure.success && failure.data.killed)
      throw new Error('rabin2 inspection timed out after 20 seconds.');
    throw new Error(
      `rabin2 failed${failure.success && failure.data.code !== undefined ? ` (${failure.data.code})` : ''}. Check the installed executable and sample format.`,
    );
  }
  abortSignal.throwIfAborted();
  let data: unknown;
  try {
    data = parseNativeBinaryJson(stdout);
  } catch {
    throw new Error(
      'rabin2 did not return valid JSON. Check the tool version and sample format.',
    );
  }
  if (data === null || typeof data !== 'object')
    throw new Error('rabin2 returned an unsupported JSON structure.');
  const wrapped = z.record(z.unknown()).safeParse(data);
  if (wrapped.success && viewKeys[input.view] in wrapped.data)
    data = wrapped.data[viewKeys[input.view]];
  const list = z.array(z.unknown()).safeParse(data);
  if (input.view !== 'info' && !list.success)
    throw new Error(
      `rabin2 did not return a ${input.view} array. Check the sample format and tool version.`,
    );
  if (input.view === 'info' && !z.record(z.unknown()).safeParse(data).success)
    throw new Error('rabin2 did not return a binary information object.');
  const totalItems = list.success ? list.data.length : undefined;
  if (list.success) data = list.data.slice(0, input.maxItems);
  return {
    samplePath,
    toolPath,
    view: input.view,
    data,
    ...(totalItems === undefined
      ? {}
      : { totalItems, returnedItems: Math.min(totalItems, input.maxItems) }),
    truncated: totalItems !== undefined && totalItems > input.maxItems,
    ...(stderr.trim() ? { diagnostics: stderr.trim().slice(0, 2000) } : {}),
  };
}

class BinaryInspectInvocation extends BaseToolInvocation<
  BinaryInspectParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BinaryInspectParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Binary Structure Inspection');
  }
  getDescription(): string {
    return `Inspecting ${this.params.view || 'info'} in ${this.params.filePath}`;
  }
  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      const result = await inspectBinary(
        this.params,
        this.config.getTargetDir(),
        abortSignal,
        (file) => this.config.validatePathAccess(file, 'read'),
      );
      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: `✓ Binary ${result.view}: ${result.samplePath}${result.truncated ? ` (${result.returnedItems}/${result.totalItems} items)` : ''}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Binary inspection failed: ${message}`,
        returnDisplay: message,
        error: { message, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

export class BinaryInspectTool extends BaseDeclarativeTool<
  BinaryInspectParams,
  ToolResult
> {
  static readonly Name = 'binary_inspect';
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      BinaryInspectTool.Name,
      'Binary Structure Inspection',
      'Reads actual binary metadata, imports, sections, libraries or symbols using the local rabin2 from radare2. Does not execute or modify the sample. Output integers outside the exact JavaScript range are strings; retain them as strings for later 64-bit address queries. Use this to verify string-based binary_triage candidates. Requires rabin2 in PATH or GEMINI_ULTRA_TOOL_RABIN2. Bounded to 20 seconds and 4 MiB of output.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Local sample path, relative to the workspace or absolute.',
          },
          view: {
            type: 'string',
            enum: ['info', 'imports', 'sections', 'libraries', 'symbols'],
            description: 'Read-only data to inspect; defaults to info.',
          },
          maxItems: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            description:
              'Maximum array entries returned (default 200). Reports totalItems and truncation explicitly.',
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
    params: BinaryInspectParams,
  ): string | null {
    const parsed = inspectSchema.safeParse(params);
    return parsed.success
      ? null
      : parsed.error.issues.map((issue) => issue.message).join('; ');
  }
  protected createInvocation(
    params: BinaryInspectParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new BinaryInspectInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}
