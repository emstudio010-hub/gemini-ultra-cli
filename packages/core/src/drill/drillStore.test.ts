/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DrillStore } from './drillStore.js';
import { recordFactTool, DrillRecordFactTool } from '../tools/drillTools.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { ToolErrorType } from '../tools/tool-error.js';

describe('Drill fact categories and search boundaries', () => {
  let directory: string;
  let database: string;
  let store: DrillStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ultra-facts-'));
    database = join(directory, 'facts.sqlite');
    store = DrillStore.getInstance(database);
  });

  afterEach(() => {
    DrillStore.resetInstance();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reports a write lock as a tool failure and recovers once the lock is released', async () => {
    const tool = new DrillRecordFactTool(
      makeFakeConfig({
        sessionId: 'alpha',
        cwd: directory,
        targetDir: directory,
        usageStatisticsEnabled: false,
      }),
      createMockMessageBus(),
    );
    const lock = new DatabaseSync(database);
    lock.exec('BEGIN IMMEDIATE');
    const params = { category: 'note', title: 'Locked observation' } as const;
    try {
      const failed = await tool.buildAndExecute(
        params,
        new AbortController().signal,
      );
      expect(failed.error).toMatchObject({
        type: ToolErrorType.EXECUTION_FAILED,
      });
      expect(failed.llmContent).toContain('"success":false');
      expect(store.queryFacts('alpha')).toHaveLength(0);
    } finally {
      lock.exec('ROLLBACK');
      lock.close();
    }
    const recovered = await tool.buildAndExecute(
      params,
      new AbortController().signal,
    );
    expect(recovered.error).toBeUndefined();
    expect(recovered.llmContent).toContain('"success":true');
    expect(store.queryFacts('alpha')).toHaveLength(1);
  });

  it('persists notes separately and preserves binary and informational findings', () => {
    expect(
      recordFactTool('alpha', {
        category: 'note',
        title: 'Parser observation',
        notes: 'Checks the file header',
        evidence: 'Header length is 16 bytes',
      }).success,
    ).toBe(true);
    store.recordBinaryArtifact({
      sessionId: 'alpha',
      samplePath: 'sample.bin',
      sha256: 'abc',
      md5: 'def',
      size: 16,
    });
    store.recordVuln({
      sessionId: 'alpha',
      title: 'Informational finding',
      severity: 'info',
    });

    DrillStore.resetInstance();
    store = DrillStore.getInstance(database);
    const facts = store.queryFacts('alpha');
    expect(facts).toHaveLength(3);
    expect(facts.find((fact) => fact['factType'] === 'note')).toMatchObject({
      title: 'Parser observation',
      content: 'Checks the file header',
      evidence: 'Header length is 16 bytes',
    });
    expect(facts.filter((fact) => fact['factType'] === 'binary')).toHaveLength(
      1,
    );
    expect(
      facts.find((fact) => fact['severity'] === 'info')?.['factType'],
    ).toBe('vuln');
  });

  it('restricts indexed keyword searches to the requested session', () => {
    store.recordNote({
      sessionId: 'alpha',
      title: 'Sharedtoken',
      content: 'First observation',
    });
    store.recordNote({
      sessionId: 'beta',
      title: 'Sharedtoken',
      content: 'Private to beta',
    });
    expect(store.queryFacts('alpha', 'Sharedtoken')).toMatchObject([
      { session_id: 'alpha', factType: 'note', title: 'Sharedtoken' },
    ]);
    expect(store.queryFacts(undefined, 'Sharedtoken')).toHaveLength(2);
    expect(store.queryFacts('alpha', 'absenttoken')).toEqual([]);
  });

  it('filters literal keywords and sessions when the optional index is unavailable', () => {
    const connection = new DatabaseSync(database);
    try {
      connection.exec('DROP TABLE IF EXISTS facts_fts');
      connection.exec('DROP TABLE IF EXISTS facts_search_v2');
    } finally {
      connection.close();
    }
    store.recordNote({
      sessionId: 'alpha',
      title: 'Plain observation',
      content: 'Fix (offset+4)',
    });
    store.recordNote({
      sessionId: 'beta',
      title: 'Other session',
      content: 'Fix (offset+4)',
    });
    store.recordNote({ sessionId: 'alpha', title: 'Unrelated observation' });
    expect(store.queryFacts('alpha', '(offset+4)')).toMatchObject([
      { session_id: 'alpha', factType: 'note', content: 'Fix (offset+4)' },
    ]);
    expect(store.queryFacts('alpha', 'missing%')).toEqual([]);
  });
});
