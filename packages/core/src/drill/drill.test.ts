/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DrillStore } from './drillStore.js';
import { calculateEntropy, detectBinaryFileType, verifiedPatchTransaction } from '../tools/reverseTools.js';
import { HybridMemoryEngine } from '../memory/hybridMemoryEngine.js';

describe('Drill & Reverse & Hybrid Memory Integration', () => {
  const tmpDir = path.join(os.tmpdir(), `test-drill-suite-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    DrillStore.resetInstance();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('calculates Shannon entropy and detects binary types correctly', () => {
    const peBuf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(detectBinaryFileType(peBuf)).toContain('PE');

    const elfBuf = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
    expect(detectBinaryFileType(elfBuf)).toContain('ELF');

    const entropy = calculateEntropy(Buffer.from('AAAAAAAABBBBBBBB'));
    expect(entropy).toBe(1);
  });

  it('records facts in DrillStore and queries them', () => {
    const dbPath = path.join(tmpDir, 'facts.sqlite');
    const store = new DrillStore(dbPath);

    store.bindEngagement('test-sess-1', 'target.local');
    const artId = store.recordBinaryArtifact({
      sessionId: 'test-sess-1',
      samplePath: 'sample.exe',
      sha256: 'deadbeef123',
      md5: '0123456789abcdef',
      size: 1024,
      fileType: 'PE',
      notes: 'Test sample',
    });
    expect(artId).toBeGreaterThan(0);

    const vulnId = store.recordVuln({
      sessionId: 'test-sess-1',
      title: 'SQL Injection in /api/login',
      cve: 'CVE-2026-9999',
      severity: 'critical',
    });
    expect(vulnId).toBeGreaterThan(0);

    const queried = store.queryFacts('test-sess-1');
    expect(queried.length).toBe(2);
  });

  it('creates full verified patch transaction contract', () => {
    const sampleFile = path.join(tmpDir, 'target.bin');
    fs.writeFileSync(sampleFile, 'ORIGINAL_BINARY_CONTENT');

    const res = verifiedPatchTransaction({
      sessionId: 'patch-sess',
      targetFile: sampleFile,
      newContent: 'PATCHED_BINARY_CONTENT',
    });

    expect(fs.existsSync(res.backupFile)).toBe(true);
    expect(fs.existsSync(res.modifiedFile)).toBe(true);
    expect(fs.existsSync(res.diffFile)).toBe(true);
    expect(fs.existsSync(res.verificationFile)).toBe(true);
    expect(fs.existsSync(res.rollbackScript)).toBe(true);
    expect(fs.readFileSync(res.modifiedFile, 'utf8')).toBe('PATCHED_BINARY_CONTENT');
  });

  it('stores observations in HybridMemoryEngine and searches', () => {
    const memDir = path.join(tmpDir, 'memory');
    const engine = new HybridMemoryEngine(memDir);

    engine.storeObservation('AuthModule', 'architecture', 'Uses JWT with RS256 algorithm', 'global');
    const found = engine.searchGraph('JWT');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].entity).toBe('AuthModule');
  });
});
