/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { verifiedPatchTransaction } from './reverseTools.js';
import { DrillStore } from '../drill/drillStore.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-rollback-name-'));
  vi.stubEnv('GEMINI_DRILL_DB', path.join(root, 'facts.sqlite'));
});
afterEach(() => {
  DrillStore.resetInstance();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it.each(['literal # target.txt', 'literal%20target.txt'])(
  'rolls back the literal filename %s rather than interpreting a URL fragment or escape',
  (name) => {
    const target = path.join(root, name);
    fs.writeFileSync(target, 'ORIGINAL');
    const record = verifiedPatchTransaction({
      sessionId: 'rollback-literal-fixture',
      targetFile: target,
      newContent: 'PATCHED',
    });
    expect(fs.readFileSync(target, 'utf8')).toBe('PATCHED');
    execFileSync(process.execPath, [record.rollbackScript], {
      windowsHide: true,
      timeout: 5000,
    });
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');
    expect(fs.readFileSync(record.backupFile, 'utf8')).toBe('ORIGINAL');
    expect(fs.existsSync(path.join(root, 'literal target.txt'))).toBe(false);
  },
);
