/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { DrillStore } from '../drill/drillStore.js';
import { readDrillGrant } from '../drill/drillGrant.js';
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
  tools: Record<string, { available: boolean; pathOrStatus?: string; version?: string }>;
}

export function checkBinary(cmd: string): { available: boolean; pathOrStatus?: string } {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where ${cmd}` : `which ${cmd}`;
    const out = execSync(checkCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { available: true, pathOrStatus: out.split('\n')[0].trim() };
  } catch {
    return { available: false, pathOrStatus: 'not found in PATH' };
  }
}

export async function checkIdaMcp(
  port = 8745,
): Promise<{ available: boolean; pathOrStatus: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { available: res.ok, pathOrStatus: `HTTP ${res.status}` };
  } catch {
    return { available: false, pathOrStatus: 'connection refused / inactive' };
  }
}

export async function runDrillPreflight(): Promise<DrillPreflightResult> {
  const grant = readDrillGrant();
  const ida = await checkIdaMcp();

  const toolNames = [
    'ghidra',
    'radare2',
    'r2',
    'jadx',
    'frida',
    'nuclei',
    'fscan',
    'gogo',
    'python3',
    'python',
  ];
  const tools: Record<string, { available: boolean; pathOrStatus?: string }> = {
    'ida-pro-mcp': ida,
  };

  for (const name of toolNames) {
    tools[name] = checkBinary(name);
  }

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
    } else {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export function queryFactsTool(sessionId?: string, keyword?: string): unknown[] {
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
    const availableCount = Object.values(res.tools).filter((t) => t.available).length;
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
    const res = recordFactTool(this.config.getSessionId(), this.params);
    return {
      llmContent: JSON.stringify(res),
      returnDisplay: res.success
        ? `✓ 已归档演练事实 #${res.id}: [${this.params.category}] ${this.params.title}`
        : `归档失败: ${res.error}`,
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
            description: 'Fact category.',
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
          evidence: { type: 'string', description: 'Key technical evidence or log snippet.' },
          poc: { type: 'string', description: 'Verification PoC or reproduction steps.' },
          samplePath: { type: 'string', description: 'Path to binary sample if applicable.' },
          sha256: { type: 'string', description: 'SHA-256 hash of binary sample.' },
          notes: { type: 'string', description: 'Additional analysis notes.' },
        },
        required: ['category', 'title'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: DrillRecordFactParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new DrillRecordFactInvocation(this.config, params, messageBus, toolName);
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
    return new DrillQueryFactsInvocation(this.config, params, messageBus, toolName);
  }
}
