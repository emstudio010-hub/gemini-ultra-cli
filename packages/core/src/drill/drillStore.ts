/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function getDrillDbPath(): string {
  const custom = process.env['GEMINI_DRILL_DB'];
  if (custom) return custom;
  return path.join(os.homedir(), '.gemini', 'drill', 'drill-facts.sqlite');
}

export const HAS_FTS5 = (() => {
  try {
    const probe = new DatabaseSync(':memory:');
    try {
      probe.exec('CREATE VIRTUAL TABLE __fts5_probe USING fts5(x);');
      return true;
    } finally {
      probe.close();
    }
  } catch {
    return false;
  }
})();

export class DrillStore {
  private static instance: DrillStore | null = null;
  private db: DatabaseSync;

  constructor(dbPath: string = getDrillDbPath()) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  static getInstance(dbPath?: string): DrillStore {
    if (!DrillStore.instance) {
      DrillStore.instance = new DrillStore(dbPath);
    }
    return DrillStore.instance;
  }

  static resetInstance(): void {
    if (DrillStore.instance) {
      try {
        DrillStore.instance.db.close();
      } catch {
        // Reset must still release the singleton after an already closed DB.
      }
      DrillStore.instance = null;
    }
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS engagement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root_session_id TEXT UNIQUE NOT NULL,
        target TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        ip TEXT NOT NULL,
        domain TEXT,
        status TEXT DEFAULT 'alive',
        first_seen TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS port (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        port INTEGER NOT NULL,
        proto TEXT DEFAULT 'tcp',
        state TEXT DEFAULT 'open',
        banner TEXT,
        url TEXT,
        title TEXT,
        first_seen TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS binary_artifact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        sample_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        md5 TEXT NOT NULL,
        size INTEGER NOT NULL,
        file_type TEXT,
        entropy REAL,
        is_packed INTEGER DEFAULT 0,
        high_risk_apis TEXT,
        rva_offsets TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vuln (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        asset_id INTEGER,
        cve TEXT,
        title TEXT NOT NULL,
        severity TEXT,
        status TEXT DEFAULT 'unverified',
        evidence TEXT,
        poc TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patch_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        original_path TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        modified_path TEXT NOT NULL,
        diff_path TEXT NOT NULL,
        rollback_script TEXT NOT NULL,
        status TEXT DEFAULT 'applied',
        created_at TEXT NOT NULL
      );
    `);

    if (HAS_FTS5) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
            session_id UNINDEXED, category, title, content
          );
        `);
      } catch {
        // Full-text search is optional; canonical tables remain available.
      }
    }
  }

  bindEngagement(sessionId: string, target: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO engagement (root_session_id, target, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(root_session_id) DO UPDATE SET target = excluded.target;
    `);
    stmt.run(sessionId, target, new Date().toISOString());
  }

  recordBinaryArtifact(data: {
    sessionId: string;
    samplePath: string;
    sha256: string;
    md5: string;
    size: number;
    fileType?: string;
    entropy?: number;
    isPacked?: boolean;
    highRiskApis?: string[];
    rvaOffsets?: Record<string, string>;
    notes?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO binary_artifact (
        session_id, sample_path, sha256, md5, size, file_type, entropy,
        is_packed, high_risk_apis, rva_offsets, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    const res = stmt.run(
      data.sessionId,
      data.samplePath,
      data.sha256,
      data.md5,
      data.size,
      data.fileType || 'binary',
      data.entropy || 0,
      data.isPacked ? 1 : 0,
      JSON.stringify(data.highRiskApis || []),
      JSON.stringify(data.rvaOffsets || {}),
      data.notes || '',
      new Date().toISOString(),
    );
    const lastId = Number(res.lastInsertRowid);

    if (HAS_FTS5) {
      try {
        this.db
          .prepare(
            `INSERT INTO facts_fts (session_id, category, title, content) VALUES (?, 'binary', ?, ?);`,
          )
          .run(
            data.sessionId,
            path.basename(data.samplePath),
            `${data.sha256} ${data.fileType || ''} ${data.notes || ''}`,
          );
      } catch {
        // Preserve the binary record when the optional index is unavailable.
      }
    }
    return lastId;
  }

  recordVuln(data: {
    sessionId: string;
    assetId?: number;
    cve?: string;
    title: string;
    severity?: string;
    status?: string;
    evidence?: string;
    poc?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO vuln (
        session_id, asset_id, cve, title, severity, status, evidence, poc, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    const res = stmt.run(
      data.sessionId,
      data.assetId || null,
      data.cve || null,
      data.title,
      data.severity || 'medium',
      data.status || 'verified',
      data.evidence || '',
      data.poc || '',
      new Date().toISOString(),
    );
    const lastId = Number(res.lastInsertRowid);

    if (HAS_FTS5) {
      try {
        this.db
          .prepare(
            `INSERT INTO facts_fts (session_id, category, title, content) VALUES (?, 'vuln', ?, ?);`,
          )
          .run(
            data.sessionId,
            data.title,
            `${data.cve || ''} ${data.severity || ''} ${data.evidence || ''} ${data.poc || ''}`,
          );
      } catch {
        // Preserve the finding when the optional index is unavailable.
      }
    }
    return lastId;
  }

  recordNote(data: {
    sessionId: string;
    title: string;
    content?: string;
    evidence?: string;
  }): number {
    const result = this.db
      .prepare(
        'INSERT INTO note (session_id, title, content, evidence, created_at) VALUES (?, ?, ?, ?, ?);',
      )
      .run(
        data.sessionId,
        data.title,
        data.content || '',
        data.evidence || '',
        new Date().toISOString(),
      );
    if (HAS_FTS5) {
      try {
        this.db
          .prepare(
            "INSERT INTO facts_fts (session_id, category, title, content) VALUES (?, 'note', ?, ?);",
          )
          .run(
            data.sessionId,
            data.title,
            `${data.content || ''} ${data.evidence || ''}`,
          );
      } catch {
        // The canonical note remains available without the optional search index.
      }
    }
    return Number(result.lastInsertRowid);
  }

  recordPatchTransaction(data: {
    sessionId: string;
    originalPath: string;
    backupPath: string;
    modifiedPath: string;
    diffPath: string;
    rollbackScript: string;
    status?: 'applied' | 'staged';
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO patch_transaction (
        session_id, original_path, backup_path, modified_path, diff_path, rollback_script, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);
    const res = stmt.run(
      data.sessionId,
      data.originalPath,
      data.backupPath,
      data.modifiedPath,
      data.diffPath,
      data.rollbackScript,
      new Date().toISOString(),
      data.status || 'applied',
    );
    return Number(res.lastInsertRowid);
  }

  queryFacts(
    sessionId?: string,
    keyword?: string,
  ): Array<Record<string, SQLOutputValue>> {
    if (keyword && HAS_FTS5) {
      try {
        const sessionFilter = sessionId ? ' AND session_id = ?' : '';
        const stmt = this.db.prepare(
          `SELECT *, category AS factType FROM facts_fts WHERE facts_fts MATCH ?${sessionFilter} ORDER BY rowid DESC LIMIT 50;`,
        );
        return sessionId ? stmt.all(keyword, sessionId) : stmt.all(keyword);
      } catch {
        // Invalid FTS syntax or unavailable index: use literal search below.
      }
    }

    // Literal substring fallback also works without FTS5 and for punctuation
    // that is not a valid FTS expression. Never discard the session boundary.
    const sources = [
      [
        'binary_artifact',
        'binary',
        ['sample_path', 'sha256', 'file_type', 'notes'],
      ],
      ['vuln', 'vuln', ['title', 'cve', 'severity', 'evidence', 'poc']],
      ['note', 'note', ['title', 'content', 'evidence']],
    ] as const;
    const rows = sources.flatMap(([table, factType, columns]) => {
      const filters: string[] = [];
      const bindings: string[] = [];
      if (sessionId) {
        filters.push('session_id = ?');
        bindings.push(sessionId);
      }
      if (keyword) {
        filters.push(
          `(${columns.map((column) => `instr(lower(COALESCE(${column}, '')), lower(?)) > 0`).join(' OR ')})`,
        );
        bindings.push(...columns.map(() => keyword));
      }
      const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
      return this.db
        .prepare(
          `SELECT *, '${factType}' AS factType FROM ${table}${where} ORDER BY created_at DESC, id DESC LIMIT 50;`,
        )
        .all(...bindings);
    });
    return rows
      .sort(
        (a, b) =>
          String(b['created_at']).localeCompare(String(a['created_at'])) ||
          Number(b['id']) - Number(a['id']),
      )
      .slice(0, 50);
  }

  queryPatchTransactions(
    sessionId?: string,
  ): Array<Record<string, SQLOutputValue>> {
    try {
      if (sessionId) {
        const stmt = this.db.prepare(
          'SELECT * FROM patch_transaction WHERE session_id = ? ORDER BY id DESC LIMIT 50;',
        );
        return stmt.all(sessionId);
      }
      const stmt = this.db.prepare(
        'SELECT * FROM patch_transaction ORDER BY id DESC LIMIT 50;',
      );
      return stmt.all();
    } catch {
      return [];
    }
  }
}
