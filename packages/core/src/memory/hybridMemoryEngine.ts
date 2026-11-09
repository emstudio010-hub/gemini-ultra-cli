/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function getMemoryDir(): string {
  const custom = process.env['GEMINI_MEMORY_DIR'];
  if (custom) return custom;
  return path.join(os.homedir(), '.gemini', 'memory');
}

export interface GraphEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface GraphRelation {
  from: string;
  to: string;
  relationType: string;
}

export class HybridMemoryEngine {
  private static instance: HybridMemoryEngine | null = null;
  private db: DatabaseSync;
  private memoryDir: string;

  constructor(memoryDir: string = getMemoryDir()) {
    this.memoryDir = memoryDir;
    fs.mkdirSync(memoryDir, { recursive: true });
    const dbPath = path.join(memoryDir, 'memory_graph.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  static getInstance(memoryDir?: string): HybridMemoryEngine {
    if (!HybridMemoryEngine.instance) {
      HybridMemoryEngine.instance = new HybridMemoryEngine(memoryDir);
    }
    return HybridMemoryEngine.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS entities (
        name TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_name TEXT NOT NULL,
        observation TEXT NOT NULL,
        scope TEXT DEFAULT 'global',
        created_at TEXT NOT NULL,
        FOREIGN KEY (entity_name) REFERENCES entities(name) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relations (
        src TEXT NOT NULL,
        dst TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (src, dst, relation_type)
      );
    `);

    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          entity_name, observation
        );
      `);
    } catch {}
  }

  storeObservation(entityName: string, entityType: string, observation: string, scope: 'global' | 'workspace' = 'global'): void {
    const trimmedEntity = entityName.trim();
    const trimmedObs = observation.trim();
    if (!trimmedEntity || !trimmedObs) return;

    // 1. Ensure entity
    const entStmt = this.db.prepare(`
      INSERT INTO entities (name, entity_type, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET entity_type = excluded.entity_type;
    `);
    entStmt.run(trimmedEntity, entityType, new Date().toISOString());

    // 2. Insert observation
    const obsStmt = this.db.prepare(`
      INSERT INTO observations (entity_name, observation, scope, created_at)
      VALUES (?, ?, ?, ?);
    `);
    obsStmt.run(trimmedEntity, trimmedObs, scope, new Date().toISOString());

    // 3. FTS5 index
    try {
      this.db.prepare(`
        INSERT INTO memory_fts (entity_name, observation) VALUES (?, ?);
      `).run(trimmedEntity, trimmedObs);
    } catch {}

    // 4. Append to human readable MEMORY.md
    const memoryMdPath = path.join(this.memoryDir, 'MEMORY.md');
    const line = `- **${trimmedEntity}** (${entityType}) [${scope}]: ${trimmedObs}\n`;
    fs.appendFileSync(memoryMdPath, line, 'utf8');
  }

  storeRelation(from: string, to: string, relationType: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO relations (src, dst, relation_type, created_at)
      VALUES (?, ?, ?, ?);
    `);
    stmt.run(from.trim(), to.trim(), relationType.trim(), new Date().toISOString());
  }

  searchGraph(query: string, limit = 10): Array<{ entity: string; type: string; observation: string }> {
    const results: Array<{ entity: string; type: string; observation: string }> = [];

    try {
      const ftsStmt = this.db.prepare(`
        SELECT entity_name, observation FROM memory_fts WHERE memory_fts MATCH ? LIMIT ?;
      `);
      const rows: any[] = ftsStmt.all(query, limit);
      for (const row of rows) {
        results.push({
          entity: row.entity_name,
          type: 'matched',
          observation: row.observation,
        });
      }
    } catch {
      // Fallback to LIKE
      const likeStmt = this.db.prepare(`
        SELECT entity_name, observation FROM observations
        WHERE entity_name LIKE ? OR observation LIKE ? LIMIT ?;
      `);
      const wildcard = `%${query}%`;
      const rows: any[] = likeStmt.all(wildcard, wildcard, limit);
      for (const row of rows) {
        results.push({
          entity: row.entity_name,
          type: 'matched',
          observation: row.observation,
        });
      }
    }

    return results;
  }

  readTasteMd(workspaceDir?: string): string {
    const projectTaste = workspaceDir ? path.join(workspaceDir, '.gemini', 'taste.md') : null;
    if (projectTaste && fs.existsSync(projectTaste)) {
      return fs.readFileSync(projectTaste, 'utf8');
    }
    const globalTaste = path.join(this.memoryDir, 'taste.md');
    if (fs.existsSync(globalTaste)) {
      return fs.readFileSync(globalTaste, 'utf8');
    }
    return '';
  }

  updateTasteMd(content: string, workspaceDir?: string): string {
    const targetPath = workspaceDir
      ? path.join(workspaceDir, '.gemini', 'taste.md')
      : path.join(this.memoryDir, 'taste.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    return targetPath;
  }
}
