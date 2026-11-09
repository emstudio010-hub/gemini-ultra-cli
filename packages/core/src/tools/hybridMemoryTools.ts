/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridMemoryEngine } from '../memory/hybridMemoryEngine.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';

export function memoryStoreObservationTool(params: {
  entityName: string;
  entityType?: string;
  observation: string;
  scope?: 'global' | 'workspace';
}): { success: boolean; message: string } {
  try {
    const engine = HybridMemoryEngine.getInstance();
    engine.storeObservation(
      params.entityName,
      params.entityType || 'concept',
      params.observation,
      params.scope || 'global',
    );
    return {
      success: true,
      message: `Observation stored for entity "${params.entityName}"`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
}

export function memorySearchGraphTool(query: string, limit = 10): unknown[] {
  const engine = HybridMemoryEngine.getInstance();
  return engine.searchGraph(query, limit);
}

export function tasteUpdateTool(
  content: string,
  workspaceDir?: string,
): { success: boolean; path: string } {
  const engine = HybridMemoryEngine.getInstance();
  const filePath = engine.updateTasteMd(content, workspaceDir);
  return { success: true, path: filePath };
}

export interface MemoryStoreParams {
  entityName: string;
  entityType?: string;
  observation: string;
  scope?: 'global' | 'workspace';
}

class MemoryStoreInvocation extends BaseToolInvocation<
  MemoryStoreParams,
  ToolResult
> {
  constructor(
    params: MemoryStoreParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Store Memory Observation');
  }

  getDescription(): string {
    return `Recording memory observation for "${this.params.entityName}"`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const res = memoryStoreObservationTool(this.params);
    return {
      llmContent: JSON.stringify(res),
      returnDisplay: res.success
        ? `✓ 已写入知识图谱记忆 [${this.params.entityName}]: ${this.params.observation.slice(0, 80)}`
        : `记忆写入失败: ${res.message}`,
    };
  }
}

export class MemoryStoreObservationTool extends BaseDeclarativeTool<
  MemoryStoreParams,
  ToolResult
> {
  static readonly Name = 'memory_store_observation';

  constructor(_config: Config, messageBus: MessageBus) {
    super(
      MemoryStoreObservationTool.Name,
      'Store Memory Observation',
      'Stores an entity and observation into the persistent hybrid SQLite knowledge graph and MEMORY.md.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          entityName: {
            type: 'string',
            description: 'Name of the entity, module, project, or user preference.',
          },
          entityType: {
            type: 'string',
            description: 'Category of entity (e.g., architecture, preference, module, bug).',
          },
          observation: {
            type: 'string',
            description: 'Fact or observation to remember about this entity.',
          },
          scope: {
            type: 'string',
            enum: ['global', 'workspace'],
            description: 'Memory scope (default global).',
          },
        },
        required: ['entityName', 'observation'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: MemoryStoreParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new MemoryStoreInvocation(params, messageBus, toolName);
  }
}

export interface MemorySearchParams {
  query: string;
  limit?: number;
}

class MemorySearchInvocation extends BaseToolInvocation<
  MemorySearchParams,
  ToolResult
> {
  constructor(
    params: MemorySearchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Search Memory Graph');
  }

  getDescription(): string {
    return `Searching knowledge graph for "${this.params.query}"`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const rows = memorySearchGraphTool(this.params.query, this.params.limit ?? 10);
    return {
      llmContent: JSON.stringify(rows, null, 2),
      returnDisplay: `✓ 知识图谱检索 "${this.params.query}" 命中 ${rows.length} 条记录`,
    };
  }
}

export class MemorySearchGraphTool extends BaseDeclarativeTool<
  MemorySearchParams,
  ToolResult
> {
  static readonly Name = 'memory_search_graph';

  constructor(_config: Config, messageBus: MessageBus) {
    super(
      MemorySearchGraphTool.Name,
      'Search Memory Graph',
      'Searches the persistent SQLite knowledge graph (FTS5 / keyword) for stored entities and observations.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword or phrase to search in the knowledge graph.',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default 10).',
          },
        },
        required: ['query'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: MemorySearchParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new MemorySearchInvocation(params, messageBus, toolName);
  }
}

export interface TasteUpdateParams {
  preferenceRule: string;
}

class TasteUpdateInvocation extends BaseToolInvocation<
  TasteUpdateParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: TasteUpdateParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    super(params, messageBus, toolName, 'Update Code Taste Specification');
  }

  getDescription(): string {
    return `Updating .gemini/taste.md coding style preferences`;
  }

  override async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const res = tasteUpdateTool(
      this.params.preferenceRule,
      this.config.getTargetDir(),
    );
    return {
      llmContent: `Updated taste specification at ${res.path}`,
      returnDisplay: `✓ 已更新工程代码品味规范 (${res.path})`,
    };
  }
}

export class TasteUpdateTool extends BaseDeclarativeTool<
  TasteUpdateParams,
  ToolResult
> {
  static readonly Name = 'taste_update';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      TasteUpdateTool.Name,
      'Update Code Taste',
      'Appends a coding style or engineering preference rule to the workspace `.gemini/taste.md` specification.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          preferenceRule: {
            type: 'string',
            description: 'Engineering or coding style preference rule to persist.',
          },
        },
        required: ['preferenceRule'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: TasteUpdateParams,
    messageBus: MessageBus,
    toolName?: string,
  ) {
    return new TasteUpdateInvocation(this.config, params, messageBus, toolName);
  }
}
