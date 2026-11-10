/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DrillStore } from '../drill/drillStore.js';
import { readDrillGrant } from '../drill/drillGrant.js';
import { ToolErrorType } from './tool-error.js';
import { discoverGhidraDecompiler } from './ghidraRuntime.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';

export interface DrillPreflightResult {
  granted: boolean;
  allowedNetScope: string[];
  tools: Record<
    string,
    { available: boolean; pathOrStatus?: string; version?: string }
  >;
}

const executeFile = promisify(execFile);
export function toolPathEnv(name: string): string {
  return `GEMINI_ULTRA_TOOL_${name.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
}
function configuredTool(
  name: string,
): { available: boolean; pathOrStatus: string } | undefined {
  const configured = process.env[toolPathEnv(name)];
  if (!configured) return undefined;
  try {
    if (!fs.statSync(configured).isFile())
      throw new Error('not a regular file');
    fs.accessSync(
      configured,
      process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return { available: true, pathOrStatus: configured };
  } catch {
    return {
      available: false,
      pathOrStatus: `${configured} (unavailable or not executable; check ${toolPathEnv(name)})`,
    };
  }
}

export function checkBinary(cmd: string): {
  available: boolean;
  pathOrStatus?: string;
} {
  if (!/^[a-zA-Z0-9._-]+$/.test(cmd))
    return { available: false, pathOrStatus: 'invalid tool name' };
  const configured = configuredTool(cmd);
  if (configured) return configured;
  try {
    const isWin = process.platform === 'win32';
    const out = execFileSync(isWin ? 'where.exe' : 'which', [cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
      windowsHide: true,
    }).trim();
    return { available: true, pathOrStatus: out.split('\n')[0].trim() };
  } catch {
    return { available: false, pathOrStatus: 'not found in PATH' };
  }
}

async function checkBinaryAsync(
  name: string,
): Promise<{ available: boolean; pathOrStatus: string }> {
  const configured = configuredTool(name);
  if (configured) return configured;
  try {
    const { stdout } = await executeFile(
      process.platform === 'win32' ? 'where.exe' : 'which',
      [name],
      { timeout: 1500, windowsHide: true },
    );
    return { available: true, pathOrStatus: stdout.trim().split(/\r?\n/)[0] };
  } catch {
    return {
      available: false,
      pathOrStatus: `not found; add to PATH or set ${toolPathEnv(name)}`,
    };
  }
}

export async function checkIdaMcp(
  port = 8745,
): Promise<{ available: boolean; pathOrStatus: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: controller.signal,
    });
    return { available: res.ok, pathOrStatus: `HTTP ${res.status}` };
  } catch {
    return { available: false, pathOrStatus: 'connection refused / inactive' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDrillPreflight(): Promise<DrillPreflightResult> {
  const grant = readDrillGrant();

  const toolNames = [
    'ghidra',
    'analyzeHeadless',
    'java',
    'radare2',
    'r2',
    'rabin2',
    'jadx',
    'frida',
    'nuclei',
    'fscan',
    'gogo',
    'python3',
    'python',
    'gdb',
    'lldb',
  ];
  const [ida, discovered] = await Promise.all([
    checkIdaMcp(Number(process.env['GEMINI_ULTRA_IDA_MCP_PORT']) || 8745),
    Promise.all(
      toolNames.map(
        async (name) => [name, await checkBinaryAsync(name)] as const,
      ),
    ),
  ]);
  const tools: DrillPreflightResult['tools'] = {
    'ida-pro-mcp': ida,
    ...Object.fromEntries(discovered),
  };
  const ghidraHome =
    process.env['GEMINI_ULTRA_GHIDRA_HOME'] ||
    (tools['analyzeHeadless'].available
      ? path.dirname(path.dirname(tools['analyzeHeadless'].pathOrStatus || ''))
      : undefined);
  const javaHome = process.env['JAVA_HOME'];
  if (!tools['java'].available && javaHome) {
    const java = path.join(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    );
    if (fs.existsSync(java))
      tools['java'] = { available: true, pathOrStatus: java };
  }
  const ghidraDetected =
    !!ghidraHome &&
    fs.existsSync(
      path.join(ghidraHome, 'Ghidra/Framework/Utility/lib/Utility.jar'),
    );
  tools['ghidra-decompiler'] = {
    available:
      ghidraDetected &&
      tools['java'].available &&
      discoverGhidraDecompiler(ghidraHome).available,
    pathOrStatus: ghidraDetected
      ? `${discoverGhidraDecompiler(ghidraHome).pathOrStatus}; JDK compatibility checked on use`
      : 'Set GEMINI_ULTRA_GHIDRA_HOME to the installation root and configure JAVA_HOME or GEMINI_ULTRA_TOOL_JAVA',
  };

  return {
    granted: grant.granted,
    allowedNetScope: grant.allowedNetScope || [],
    tools,
  };
}

export function recordFactTool(
  sessionId: string,
  params: {
    category: 'vuln' | 'binary' | 'note';
    title: string;
    cve?: string;
    severity?: string;
    evidence?: string;
    poc?: string;
    samplePath?: string;
    sha256?: string;
    notes?: string;
  },
): { success: boolean; id?: number; error?: string } {
  try {
    const store = DrillStore.getInstance();
    if (params.category === 'vuln') {
      const id = store.recordVuln({
        sessionId,
        title: params.title,
        cve: params.cve,
        severity: params.severity,
        evidence: params.evidence,
        poc: params.poc,
      });
      return { success: true, id };
    } else if (params.category === 'note') {
      const id = store.recordNote({
        sessionId,
        title: params.title,
        content: params.notes,
        evidence: params.evidence,
      });
      return { success: true, id };
    } else if (params.category === 'binary') {
      const id = store.recordBinaryArtifact({
        sessionId,
        samplePath: params.samplePath || params.title,
        sha256: params.sha256 || 'unknown',
        md5: 'unknown',
        size: 0,
        notes: params.notes || params.evidence,
      });
      return { success: true, id };
    }
    return {
      success: false,
      error: 'Invalid category: use vuln, binary or note.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export function queryFactsTool(
  sessionId?: string,
  keyword?: string,
): unknown[] {
  const store = DrillStore.getInstance();
  return store.queryFacts(sessionId, keyword);
}

class DrillPreflightInvocation extends BaseToolInvocation<
  Record<string, never>,
  ToolResult
> {
  constructor(
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Drill Toolchain Preflight');
  }

  getDescription(): string {
    return 'Checking local analysis & drill toolchain availability';
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const res = await runDrillPreflight();
    const availableCount = Object.values(res.tools).filter(
      (t) => t.available,
    ).length;
    return {
      llmContent: JSON.stringify(res, null, 2),
      returnDisplay: `✓ 工具链探针完成 (授权: ${res.granted ? '已开启' : '未开启'}, 就绪工具: ${availableCount}/${Object.keys(res.tools).length})`,
    };
  }
}

export class DrillPreflightTool extends BaseDeclarativeTool<
  Record<string, never>,
  ToolResult
> {
  static readonly Name = 'drill_preflight';

  constructor(_config: Config, messageBus: MessageBus) {
    super(
      DrillPreflightTool.Name,
      'Drill Preflight Check',
      'Checks availability of local binary analysis, reverse engineering, and security assessment tools (IDA MCP, Ghidra, radare2, jadx, frida, python, etc.) and drill authorization state.',
      Kind.Read,
      {
        type: 'object',
        properties: {},
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DrillPreflightInvocation(params, messageBus, toolName);
  }
}

export interface DrillRecordFactParams {
  category: 'vuln' | 'binary' | 'note';
  title: string;
  cve?: string;
  severity?: string;
  evidence?: string;
  poc?: string;
  samplePath?: string;
  sha256?: string;
  notes?: string;
}

class DrillRecordFactInvocation extends BaseToolInvocation<
  DrillRecordFactParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DrillRecordFactParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Record Drill Fact');
  }

  getDescription(): string {
    return `Recording ${this.params.category} fact: "${this.params.title}"`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const validCategories = ['vuln', 'binary', 'note'];
    if (
      !this.params.category ||
      !validCategories.includes(this.params.category)
    ) {
      const msg = `Invalid category "${this.params.category}". Category must be one of: 'vuln', 'binary', 'note'.`;
      return {
        llmContent: msg,
        returnDisplay: `归档失败: ${msg}`,
        error: { message: msg, type: ToolErrorType.INVALID_TOOL_PARAMS },
      };
    }
    const res = recordFactTool(this.config.getSessionId(), this.params);
    return {
      llmContent: JSON.stringify(res),
      returnDisplay: res.success
        ? `✓ 已归档演练事实 #${res.id}: [${this.params.category}] ${this.params.title}`
        : `归档失败: ${res.error}`,
      ...(res.success
        ? {}
        : {
            error: {
              message: res.error || 'Failed to record the drill fact.',
              type: ToolErrorType.EXECUTION_FAILED,
            },
          }),
    };
  }
}

export class DrillRecordFactTool extends BaseDeclarativeTool<
  DrillRecordFactParams,
  ToolResult
> {
  static readonly Name = 'drill_record_fact';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DrillRecordFactTool.Name,
      'Record Drill Fact',
      'Records a structured vulnerability finding, binary artifact, or technical note into the SQLite Drill Fact Store (`~/.gemini/drill/drill-facts.sqlite`).',
      Kind.Think,
      {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['vuln', 'binary', 'note'],
            description:
              'Fact category. MUST be one of: "vuln" (vulnerability finding), "binary" (executable/sample artifact), "note" (technical observation).',
          },
          title: {
            type: 'string',
            description: 'Short title of the finding or artifact.',
          },
          cve: { type: 'string', description: 'Optional CVE identifier.' },
          severity: {
            type: 'string',
            description: 'Severity level (CRITICAL, HIGH, MEDIUM, LOW, INFO).',
          },
          evidence: {
            type: 'string',
            description: 'Key technical evidence or log snippet.',
          },
          poc: {
            type: 'string',
            description: 'Verification PoC or reproduction steps.',
          },
          samplePath: {
            type: 'string',
            description: 'Path to binary sample if applicable.',
          },
          sha256: {
            type: 'string',
            description: 'SHA-256 hash of binary sample.',
          },
          notes: { type: 'string', description: 'Additional analysis notes.' },
        },
        required: ['category', 'title'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: DrillRecordFactParams,
  ): string | null {
    if (
      !params.category ||
      !['vuln', 'binary', 'note'].includes(params.category)
    ) {
      return `Invalid or missing required property 'category'. Allowed values are: 'vuln', 'binary', 'note'.`;
    }
    if (!params.title || typeof params.title !== 'string') {
      return `Missing required property 'title'.`;
    }
    return null;
  }

  protected createInvocation(
    params: DrillRecordFactParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DrillRecordFactInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}

export interface DrillQueryFactsParams {
  keyword?: string;
  currentSessionOnly?: boolean;
}

class DrillQueryFactsInvocation extends BaseToolInvocation<
  DrillQueryFactsParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DrillQueryFactsParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Query Drill Facts');
  }

  getDescription(): string {
    return `Querying drill facts (keyword: ${this.params.keyword || '*'})`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const sid = this.params.currentSessionOnly
      ? this.config.getSessionId()
      : undefined;
    const rows = queryFactsTool(sid, this.params.keyword);
    return {
      llmContent: JSON.stringify(rows, null, 2),
      returnDisplay: `✓ 演练事实库检索命中 ${rows.length} 条记录`,
    };
  }
}

export class DrillQueryFactsTool extends BaseDeclarativeTool<
  DrillQueryFactsParams,
  ToolResult
> {
  static readonly Name = 'drill_query_facts';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DrillQueryFactsTool.Name,
      'Query Drill Facts',
      'Queries stored findings, binary artifacts, and notes from the SQLite Drill Fact Store.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Optional search keyword.',
          },
          currentSessionOnly: {
            type: 'boolean',
            description: 'Filter to current session only (default false).',
          },
        },
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: DrillQueryFactsParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DrillQueryFactsInvocation(
      this.config,
      params,
      messageBus,
      toolName,
    );
  }
}
