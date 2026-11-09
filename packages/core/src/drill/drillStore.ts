/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSync } from 'node:sqlite';
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
      } catch {}
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
      } catch {}
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
      } catch {}
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
      } catch {}
    }
    return lastId;
  }

  recordPatchTransaction(data: {
    sessionId: string;
    originalPath: string;
    backupPath: string;
    modifiedPath: string;
    diffPath: string;
    rollbackScript: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO patch_transaction (
        session_id, original_path, backup_path, modified_path, diff_path, rollback_script, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);
    `);
    const res = stmt.run(
      data.sessionId,
      data.originalPath,
      data.backupPath,
      data.modifiedPath,
      data.diffPath,
      data.rollbackScript,
      new Date().toISOString(),
    );
    return Number(res.lastInsertRowid);
  }

  queryFacts(sessionId?: string, keyword?: string): any[] {
    if (keyword && HAS_FTS5) {
      try {
        const stmt = this.db.prepare(`
          SELECT * FROM facts_fts WHERE facts_fts MATCH ? LIMIT 50;
        `);
        return stmt.all(keyword);
      } catch {}
    }

    if (sessionId) {
      const artStmt = this.db.prepare(
        'SELECT * FROM binary_artifact WHERE session_id = ? ORDER BY id DESC;',
      );
      const vulnStmt = this.db.prepare(
        'SELECT * FROM vuln WHERE session_id = ? ORDER BY id DESC;',
      );
      return [
        ...artStmt.all(sessionId).map((x: any) => ({ ...x, factType: 'binary' })),
        ...vulnStmt.all(sessionId).map((x: any) => ({ ...x, factType: 'vuln' })),
      ];
    }

    const stmt = this.db.prepare(
      'SELECT * FROM binary_artifact ORDER BY id DESC LIMIT 20;',
    );
    return stmt.all();
  }
}
