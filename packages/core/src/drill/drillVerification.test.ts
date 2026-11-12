/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DrillStore } from './drillStore.js';
import { DrillRecordFactTool, recordFactTool } from '../tools/drillTools.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

let root: string;
let store: DrillStore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-fact-verification-'));
  store = DrillStore.getInstance(path.join(root, 'facts.sqlite'));
});
afterEach(() => {
  DrillStore.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
});

it('does not promote unspecified candidate status in either the store or fact helper', () => {
  store.recordVuln({
    sessionId: 'review',
    title: 'Possible issue without evidence',
  });
  expect(
    recordFactTool('review', {
      category: 'vuln',
      title: 'Candidate from model',
    }).success,
  ).toBe(true);
  expect(store.queryFacts('review').map((row) => row['status'])).toEqual([
    'unverified',
    'unverified',
  ]);
});

it('exposes explicit verification states and persists static review separately from verified evidence', async () => {
  const tool = new DrillRecordFactTool(
    makeFakeConfig({
      sessionId: 'review',
      cwd: root,
      targetDir: root,
      usageStatisticsEnabled: false,
    }),
    createMockMessageBus(),
  );
  expect(tool.schema.parametersJsonSchema).toMatchObject({
    properties: {
      status: { enum: ['unverified', 'static-reviewed', 'verified'] },
    },
  });
  for (const status of ['static-reviewed', 'verified'] as const) {
    const result = await tool.buildAndExecute(
      {
        category: 'vuln',
        title: status,
        status,
        evidence:
          status === 'static-reviewed'
            ? 'Input reaches file read in source.ts:6; runtime not exercised'
            : 'Specific validation outcome and evidence artifact',
      },
      new AbortController().signal,
    );
    expect(result.error).toBeUndefined();
  }
  expect(
    store
      .queryFacts('review')
      .map((row) => row['status'])
      .sort(),
  ).toEqual(['static-reviewed', 'verified']);
});

it('rejects promoted states without evidence, invalid states and status on non-vuln facts without writing', () => {
  for (const params of [
    { category: 'vuln', title: 'Missing evidence', status: 'verified' },
    {
      category: 'vuln',
      title: 'Blank evidence',
      status: 'static-reviewed',
      evidence: '  ',
    },
    { category: 'vuln', title: 'Unknown state', status: 'guessed' },
    {
      category: 'note',
      title: 'Not a vulnerability',
      status: 'verified',
      evidence: 'note',
    },
  ]) {
    // Exercise direct helper callers too; JSON schema is not their validation boundary.
    expect(
      recordFactTool('review', params as Parameters<typeof recordFactTool>[1]),
    ).toMatchObject({ success: false });
  }
  expect(store.queryFacts('review')).toEqual([]);
  expect(() =>
    store.recordVuln({
      sessionId: 'review',
      title: 'Direct empty verified',
      status: 'verified',
    }),
  ).toThrow(/evidence/i);
});
