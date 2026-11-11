/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BinaryInspectTool } from './binaryInspect.js';
import { BinaryAnalyzeTool } from './binaryAnalyze.js';
import { BinaryTriageTool } from './reverseTools.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { DrillStore } from '../drill/drillStore.js';

const { execute, discover } = vi.hoisted(() => ({
  execute: vi.fn(),
  discover: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: execute,
}));
vi.mock('./drillTools.js', () => ({ checkBinary: discover }));
let root: string;
beforeEach(() => {
  vi.resetAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-binary-access-'));
  vi.stubEnv('GEMINI_DRILL_DB', path.join(root, 'facts.sqlite'));
  discover.mockReturnValue({ available: false });
});
afterEach(() => {
  DrillStore.resetInstance();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
it.each(['triage', 'inspect', 'analyze'] as const)(
  'checks canonical workspace read access before %s reads or discovers native tools',
  async (kind) => {
    const sample = path.join(root, 'sample.bin');
    fs.writeFileSync(sample, 'PRIVATE_BINARY_SAMPLE');
    const alias = path.join(root, 'alias.bin');
    fs.symlinkSync(sample, alias, 'file');
    const config = makeFakeConfig({ targetDir: root });
    const validate = vi
      .spyOn(config, 'validatePathAccess')
      .mockReturnValue('Fixture workspace read denied');
    const bus = createMockMessageBus();
    const tool =
      kind === 'triage'
        ? new BinaryTriageTool(config, bus)
        : kind === 'inspect'
          ? new BinaryInspectTool(config, bus)
          : new BinaryAnalyzeTool(config, bus);
    const result = await tool
      .build({ filePath: 'alias.bin' })
      .execute({ abortSignal: new AbortController().signal });
    expect(result.error?.message).toBe('Fixture workspace read denied');
    expect(validate).toHaveBeenCalledWith(fs.realpathSync(sample), 'read');
    expect(discover).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(result.llmContent).not.toContain('PRIVATE_BINARY_SAMPLE');
    expect(fs.readFileSync(sample, 'utf8')).toBe('PRIVATE_BINARY_SAMPLE');
  },
);
it('resolves relative triage paths from the configured project and honours pre-cancellation', async () => {
  const sample = path.join(root, 'project-relative.bin');
  fs.writeFileSync(sample, 'benign source-owned sample');
  const config = makeFakeConfig({ targetDir: root });
  const validate = vi.spyOn(config, 'validatePathAccess').mockReturnValue(null);
  const tool = new BinaryTriageTool(config, createMockMessageBus());
  const result = await tool
    .build({ filePath: 'project-relative.bin' })
    .execute({ abortSignal: new AbortController().signal });
  expect(result.error).toBeUndefined();
  expect(result.llmContent).toContain(sample.replace(/\\/g, '\\\\'));
  expect(validate).toHaveBeenCalledWith(fs.realpathSync(sample), 'read');
  validate.mockClear();
  const cancelled = await tool
    .build({ filePath: 'missing.bin' })
    .execute({
      abortSignal: AbortSignal.abort(new Error('Stopped before read')),
    });
  expect(cancelled.llmContent).toContain('Stopped before read');
  expect(validate).not.toHaveBeenCalled();
});
