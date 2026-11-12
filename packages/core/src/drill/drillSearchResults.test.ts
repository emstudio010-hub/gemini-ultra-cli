/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DrillStore, HAS_FTS5 } from './drillStore.js';

let root: string;
let database: string;
let store: DrillStore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-drill-search-'));
  database = path.join(root, 'facts.sqlite');
  store = DrillStore.getInstance(database);
});
afterEach(() => {
  DrillStore.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});

it('returns canonical IDs, states and evidence for every indexed fact type without changing phrase search', () => {
  expect(HAS_FTS5).toBe(true);
  store.recordVuln({
    sessionId: 'alpha',
    title: 'Sharedtoken source issue',
    status: 'static-reviewed',
    evidence: 'source.ts:7 input reaches readFile',
    severity: 'high',
  });
  store.recordBinaryArtifact({
    sessionId: 'alpha',
    samplePath: 'Sharedtoken.elf',
    sha256: 'exactsha',
    md5: 'exactmd5',
    size: 64,
    highRiskApis: ['read'],
    notes: 'Sharedtoken binary evidence',
  });
  store.recordNote({
    sessionId: 'alpha',
    title: 'Sharedtoken note',
    content: 'alpha beta two adjacent tokens',
    evidence: 'Sharedtoken evidence path',
  });
  store.recordNote({
    sessionId: 'alpha',
    title: 'Sharedtoken phrase negative',
    content: 'alpha separate beta',
  });
  const canonical = store.queryFacts('alpha');
  expect(store.queryFacts('alpha', 'Sharedtoken')).toEqual(canonical);
  expect(store.queryFacts('alpha', '"alpha beta"')).toEqual(
    canonical.filter((row) => row['title'] === 'Sharedtoken note'),
  );
  expect(store.queryFacts('alpha', 'Sharedtok*')).toEqual(canonical);
});

it('keeps session boundaries and separate duplicate-title facts while searching both severity and verification state', () => {
  for (const [sessionId, status] of [
    ['alpha', 'unverified'],
    ['alpha', 'static-reviewed'],
    ['beta', 'verified'],
  ] as const)
    store.recordVuln({
      sessionId,
      title: 'Sharedtoken same title',
      status,
      severity: 'high',
      evidence: 'Distinct evidence for ' + status,
    });
  const canonical = store.queryFacts('alpha');
  expect(store.queryFacts('alpha', 'Sharedtoken')).toEqual(canonical);
  expect(store.queryFacts(undefined, 'Sharedtoken')).toHaveLength(3);
  expect(store.queryFacts('alpha', 'unverified')).toEqual(
    canonical.filter((row) => row['status'] === 'unverified'),
  );
  expect(store.queryFacts('alpha', 'high')).toEqual(canonical);
});

it('builds a linked optional index from canonical legacy rows without rewriting their evidence or old index', () => {
  DrillStore.resetInstance();
  const db = new DatabaseSync(database);
  db.exec('DROP TABLE IF EXISTS facts_search_v2');
  db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(session_id UNINDEXED, category, title, content)',
  );
  db.prepare(
    'INSERT INTO facts_fts (session_id,category,title,content) VALUES (?,?,?,?)',
  ).run('legacy', 'vuln', 'Sharedtoken stale preview', 'old unlinked text');
  db.prepare(
    'INSERT INTO vuln (session_id,title,severity,status,evidence,poc,created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    'legacy',
    'Sharedtoken real finding',
    'high',
    'verified',
    'Specific original evidence',
    'Original reproduction notes',
    '2026-11-01T00:00:00Z',
  );
  const before = db.prepare('SELECT * FROM vuln').all();
  const oldIndex = db.prepare('SELECT rowid,* FROM facts_fts').all();
  db.close();
  store = DrillStore.getInstance(database);
  expect(store.queryFacts('legacy', 'Sharedtoken')).toEqual(
    store.queryFacts('legacy'),
  );
  const check = new DatabaseSync(database);
  try {
    expect(check.prepare('SELECT * FROM vuln').all()).toEqual(before);
    expect(check.prepare('SELECT rowid,* FROM facts_fts').all()).toEqual(
      oldIndex,
    );
  } finally {
    check.close();
  }
});

it('keeps literal fallback and new writes usable when the optional index is missing', () => {
  const db = new DatabaseSync(database);
  db.exec('DROP TABLE IF EXISTS facts_search_v2');
  db.exec('DROP TABLE IF EXISTS facts_fts');
  db.close();
  store.recordVuln({
    sessionId: 'alpha',
    title: 'Sharedtoken (offset+4)',
    status: 'static-reviewed',
    evidence: 'Full literal source evidence',
  });
  store.recordNote({ sessionId: 'beta', title: 'Sharedtoken private note' });
  expect(store.queryFacts('alpha', '(offset+4)')).toEqual(
    store.queryFacts('alpha'),
  );
  expect(store.queryFacts('alpha', 'static-reviewed')).toEqual(
    store.queryFacts('alpha'),
  );
  expect(store.queryFacts('alpha', 'absent')).toEqual([]);
  DrillStore.resetInstance();
  store = DrillStore.getInstance(database);
  expect(store.queryFacts('alpha', 'Sharedtok*')).toEqual(
    store.queryFacts('alpha'),
  );
});

it('rolls back an unavailable index rebuild and keeps canonical evidence readable', () => {
  store.recordNote({
    sessionId: 'alpha',
    title: 'Sharedtoken original',
    evidence: 'Original evidence',
  });
  DrillStore.resetInstance();
  const db = new DatabaseSync(database);
  db.exec(
    'DROP TABLE facts_search_v2; CREATE TABLE facts_search_v2 (incompatible TEXT)',
  );
  const original = db.prepare('SELECT * FROM note').all();
  db.close();
  store = DrillStore.getInstance(database);
  expect(store.queryFacts('alpha', 'Sharedtoken')).toMatchObject([
    {
      title: 'Sharedtoken original',
      evidence: 'Original evidence',
      factType: 'note',
    },
  ]);
  const check = new DatabaseSync(database);
  try {
    expect(check.prepare('SELECT * FROM note').all()).toEqual(original);
    expect(
      check.prepare('PRAGMA table_info(facts_search_v2)').all()[0]?.['name'],
    ).toBe('incompatible');
  } finally {
    check.close();
  }
});
