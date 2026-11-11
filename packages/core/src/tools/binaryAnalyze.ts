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

const addressSchema = z.union([
  z.number().int().nonnegative().safe(),
  z
    .string()
    .regex(/^(?:0x[0-9a-fA-F]{1,16}|[0-9]{1,20})$/)
    .refine(
      (value) => BigInt(value) <= 0xffffffffffffffffn,
      'Address exceeds 64 bits',
    ),
]);
const analyzeSchema = z
  .object({
    filePath: z.string().trim().min(1),
    view: z.enum(['functions', 'instructions', 'xrefs']).default('functions'),
    address: addressSchema.optional(),
    maxItems: z.number().int().min(1).max(500).default(100),
  })
  .refine((input) => input.view !== 'xrefs' || input.address !== undefined, {
    message: 'xrefs requires a numeric address from a previous inspection.',
  });

export interface BinaryAnalyzeParams {
  filePath: string;
  view?: 'functions' | 'instructions' | 'xrefs';
  address?: string | number;
  maxItems?: number;
}

export async function analyzeBinary(
  params: BinaryAnalyzeParams,
  baseDirectory: string,
  signal: AbortSignal,
  validateRead?: (file: string) => string | null,
) {
  const input = analyzeSchema.parse(params);
  signal.throwIfAborted();
  const samplePath = await realpath(
    path.resolve(baseDirectory, input.filePath),
  );
  const denied = validateRead?.(samplePath);
  if (denied) throw new Error(denied);
  const sample = await stat(samplePath);
  if (!sample.isFile())
    throw new Error('The target must be a regular local file.');
  if (sample.size > 64 * 1024 * 1024)
    throw new Error(
      'binary_analyze supports samples up to 64 MiB. Use a dedicated analysis session for larger files.',
    );
  const discovered = checkBinary('r2');
  if (!discovered.available || !discovered.pathOrStatus)
    throw new Error(
      'r2 is unavailable. Install radare2, add r2 to PATH or set GEMINI_ULTRA_TOOL_R2 to its executable path, then run /drill setup.',
    );
  const toolPath = discovered.pathOrStatus;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(toolPath))
    throw new Error(
      'binary_analyze needs native r2.exe on Windows. Set GEMINI_ULTRA_TOOL_R2 to the executable.',
    );
  const address =
    input.address === undefined
      ? undefined
      : '0x' + BigInt(input.address).toString(16);
  // Commands are closed templates. User addresses are normalized integers, never r2 expressions.
  const command =
    input.view === 'functions'
      ? 'aa;aflj'
      : input.view === 'xrefs'
        ? 'aaa;axtj @ ' + address
        : 'pdj ' + (input.maxItems + 1) + (address ? ' @ ' + address : '');
  signal.throwIfAborted();
  let stdout: string;
  let stderr: string;
  try {
    ({ stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          toolPath,
          ['-NN', '-q', '-x', '-e', 'scr.color=0', '-c', command, samplePath],
          {
            cwd: baseDirectory,
            encoding: 'utf8',
            shell: false,
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024,
            signal,
          },
          (error, output, diagnostics) => {
            if (error) reject(error);
            else resolve({ stdout: output, stderr: diagnostics });
          },
        );
      },
    ));
  } catch (error) {
    signal.throwIfAborted();
    const failure = z
      .object({
        code: z.union([z.string(), z.number()]).optional(),
        killed: z.boolean().optional(),
      })
      .safeParse(error);
    if (
      failure.success &&
      failure.data.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
    )
      throw new Error(
        'r2 output exceeded 4 MiB. No partial JSON is reported as complete.',
      );
    if (failure.success && failure.data.killed)
      throw new Error(
        'r2 static analysis timed out after 30 seconds. No complete analysis is claimed.',
      );
    throw new Error(
      'r2 static analysis failed. Check the installed tool and sample format.',
    );
  }
  signal.throwIfAborted();
  let decoded: unknown;
  try {
    decoded = parseNativeBinaryJson(stdout);
  } catch {
    throw new Error(
      'r2 did not return valid JSON. No partial result is reported as complete.',
    );
  }
  const location = {
    addr: addressSchema.optional(),
    offset: addressSchema.optional(),
  };
  const row =
    input.view === 'functions'
      ? z
          .object({ ...location, name: z.string() })
          .passthrough()
          .refine(
            (value) => value.addr !== undefined || value.offset !== undefined,
          )
      : input.view === 'instructions'
        ? z
            .object({ ...location, opcode: z.string() })
            .passthrough()
            .refine(
              (value) => value.addr !== undefined || value.offset !== undefined,
            )
        : z
            .object({
              from: addressSchema,
              type: z.string(),
            })
            .passthrough();
  const list = z.array(row).safeParse(decoded);
  if (!list.success)
    throw new Error('r2 returned an unsupported analysis structure.');
  const data = list.data.slice(0, input.maxItems);
  // Instructions are a bounded window, never a complete-function or whole-file claim.
  return {
    samplePath,
    toolPath,
    view: input.view,
    ...(address ? { address } : {}),
    method:
      input.view === 'functions'
        ? 'aa;aflj'
        : input.view === 'xrefs'
          ? 'aaa;axtj'
          : 'pdj',
    data,
    returnedItems: data.length,
    truncated: list.data.length > input.maxItems,
    ...(input.view === 'instructions'
      ? {
          scope:
            'Instruction window; does not prove complete function coverage.',
        }
      : {
          totalItems: list.data.length,
          scope:
            'Static analyzer observations; empty results do not prove absence of functions or references.',
        }),
    ...(stderr.trim() ? { diagnostics: stderr.trim().slice(0, 2000) } : {}),
  };
}

class BinaryAnalyzeInvocation extends BaseToolInvocation<
  BinaryAnalyzeParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BinaryAnalyzeParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Static Binary Analysis');
  }
  getDescription(): string {
    return `Analyzing ${this.params.view || 'functions'} in ${this.params.filePath}`;
  }
  override async execute({ abortSignal }: ExecuteOptions): Promise<ToolResult> {
    try {
      const result = await analyzeBinary(
        this.params,
        this.config.getTargetDir(),
        abortSignal,
        (file) => this.config.validatePathAccess(file, 'read'),
      );
      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: `✓ Binary ${result.view}: ${result.returnedItems} items${result.truncated ? ' (truncated)' : ''}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Binary analysis failed: ${message}`,
        returnDisplay: message,
        error: { message, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }
}

export class BinaryAnalyzeTool extends BaseDeclarativeTool<
  BinaryAnalyzeParams,
  ToolResult
> {
  static readonly Name = 'binary_analyze';
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      BinaryAnalyzeTool.Name,
      'Static Binary Analysis',
      'Read local binary functions, instruction windows or incoming cross-references using native radare2/r2. Does not execute or modify the sample. Use binary_triage/binary_inspect first to identify format and architecture. Numeric addresses only, no commands or expressions. Output integers outside the exact JavaScript range are strings; pass address strings unchanged to preserve 64-bit precision. functions uses aa, xrefs uses aaa and requires an address, instructions defaults to the entrypoint. Bounded to 30 seconds, 4 MiB output and 64 MiB samples. Requires r2 in PATH or GEMINI_ULTRA_TOOL_R2. Empty results do not prove absence. This is static disassembly, not decompilation or runtime verification.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Local sample path relative to the workspace or absolute.',
          },
          view: {
            type: 'string',
            enum: ['functions', 'instructions', 'xrefs'],
            description: 'Static view; defaults to functions.',
          },
          address: {
            anyOf: [
              { type: 'integer', minimum: 0 },
              {
                type: 'string',
                pattern: '^(0x[0-9a-fA-F]{1,16}|[0-9]{1,20})$',
              },
            ],
            description:
              'Unsigned numeric virtual address from an earlier inspection. Required for xrefs. No symbols or expressions.',
          },
          maxItems: {
            type: 'integer',
            minimum: 1,
            maximum: 500,
            description:
              'Maximum returned functions, instructions or references (default 100).',
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
    params: BinaryAnalyzeParams,
  ): string | null {
    const parsed = analyzeSchema.safeParse(params);
    return parsed.success
      ? null
      : parsed.error.issues.map((issue) => issue.message).join('; ');
  }
  protected createInvocation(
    params: BinaryAnalyzeParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new BinaryAnalyzeInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}
