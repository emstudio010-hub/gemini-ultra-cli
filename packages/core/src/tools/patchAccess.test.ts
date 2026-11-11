/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ApplyPatchTool,
  VerifiedPatchTransactionTool,
  applyCodexPatch,
} from './reverseTools.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { DrillStore } from '../drill/drillStore.js';
let root: string;
let project: string;
let outside: string;
it('keeps the standalone patch helper inside the canonical workspace for add/update/delete and dangling links', () => {
  const target = path.join(outside, 'target.txt');
  fs.writeFileSync(target, 'ORIGINAL');
  fs.symlinkSync(
    outside,
    path.join(project, 'redirect'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  for (const operation of [
    '*** Add File: ../outside/new.txt\n+BAD',
    '*** Update File: redirect/target.txt\n@@\n-ORIGINAL\n+BAD',
    '*** Delete File: redirect/target.txt',
  ]) {
    expect(() =>
      applyCodexPatch(`*** Begin Patch\n${operation}\n*** End Patch`, project),
    ).toThrow('Path not in workspace');
  }
  fs.symlinkSync(
    path.join(outside, 'missing.txt'),
    path.join(project, 'dangling.txt'),
    'file',
  );
  expect(() =>
    applyCodexPatch(
      '*** Begin Patch\n*** Add File: dangling.txt\n+BAD\n*** End Patch',
      project,
    ),
  ).toThrow('dangling symbolic link');
  expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');
  expect(fs.readdirSync(outside)).toEqual(['target.txt']);
});

it('checks transaction artifact destinations before creating any backup or changing the target', async () => {
  const target = path.join(project, 'target.txt');
  fs.writeFileSync(target, 'ORIGINAL');
  const config = makeFakeConfig({ targetDir: project });
  vi.spyOn(config, 'validatePathAccess').mockImplementation((file) =>
    file === target ? null : 'Artifact write denied',
  );
  const result = await new VerifiedPatchTransactionTool(
    config,
    createMockMessageBus(),
  )
    .build({
      targetFile: 'target.txt',
      newContent: 'MODIFIED',
      applyToTarget: false,
    })
    .execute({ abortSignal: new AbortController().signal });
  expect(result.error?.message).toBe('Artifact write denied');
  expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');
  expect(fs.readdirSync(project)).toEqual(['target.txt']);
});

it('preserves literal percent names in allowed nested add/update/delete operations', () => {
  const result = applyCodexPatch(
    '*** Begin Patch\n*** Add File: literal%20name/sub.txt\n+ORIGINAL\n*** Update File: literal%20name/sub.txt\n@@\n-ORIGINAL\n+MODIFIED\n*** Add File: gone.txt\n+DELETE_ME\n*** Delete File: gone.txt\n*** End Patch',
    project,
  );
  expect(result.appliedFiles).toHaveLength(4);
  expect(
    fs.readFileSync(path.join(project, 'literal%20name/sub.txt'), 'utf8'),
  ).toBe('MODIFIED');
  expect(fs.existsSync(path.join(project, 'literal name'))).toBe(false);
  expect(fs.existsSync(path.join(project, 'gone.txt'))).toBe(false);
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-patch-access-'));
  project = path.join(root, 'project');
  outside = path.join(root, 'outside');
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  vi.stubEnv('GEMINI_DRILL_DB', path.join(root, 'facts.sqlite'));
});
afterEach(() => {
  DrillStore.resetInstance();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it.each(['apply', 'verified'] as const)(
  'rejects a canonical write denial before %s creates or changes any file',
  async (kind) => {
    const target = path.join(outside, 'target.txt');
    fs.writeFileSync(target, 'ORIGINAL');
    const link = path.join(project, 'redirect');
    fs.symlinkSync(
      outside,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const config = makeFakeConfig({ targetDir: project });
    const validate = vi
      .spyOn(config, 'validatePathAccess')
      .mockImplementation((_file, check) =>
        check === 'read' ? null : 'Fixture write denied',
      );
    const bus = createMockMessageBus();
    const invocation =
      kind === 'verified'
        ? new VerifiedPatchTransactionTool(config, bus).build({
            targetFile: path.join(link, 'target.txt'),
            newContent: 'MODIFIED',
          })
        : new ApplyPatchTool(config, bus).build({
            patch:
              '*** Begin Patch\n*** Update File: redirect/target.txt\n@@\n-ORIGINAL\n+MODIFIED\n*** End Patch',
          });
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(result.error?.message).toBe('Fixture write denied');
    expect(validate).toHaveBeenCalledWith(fs.realpathSync(target), 'write');
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');
    expect(fs.readdirSync(outside)).toEqual(['target.txt']);
    expect(fs.existsSync(path.join(root, 'facts.sqlite'))).toBe(false);
  },
);
it('validates every patch target before changing the first allowed file', async () => {
  const safe = path.join(project, 'safe.txt');
  fs.writeFileSync(safe, 'ORIGINAL');
  const config = makeFakeConfig({ targetDir: project });
  vi.spyOn(config, 'validatePathAccess').mockImplementation((file) =>
    file === safe ? null : 'Later target denied',
  );
  const result = await new ApplyPatchTool(config, createMockMessageBus())
    .build({
      patch:
        '*** Begin Patch\n*** Update File: safe.txt\n@@\n-ORIGINAL\n+MODIFIED\n*** Add File: ../outside/new.txt\n+FORBIDDEN\n*** End Patch',
    })
    .execute({ abortSignal: new AbortController().signal });
  expect(result.error?.message).toBe('Later target denied');
  expect(fs.readFileSync(safe, 'utf8')).toBe('ORIGINAL');
  expect(fs.readdirSync(outside)).toEqual([]);
});
it.each(['apply', 'verified'] as const)(
  'does not touch files when %s is cancelled before execution',
  async (kind) => {
    const target = path.join(project, 'safe.txt');
    fs.writeFileSync(target, 'ORIGINAL');
    const config = makeFakeConfig({ targetDir: project });
    const validate = vi
      .spyOn(config, 'validatePathAccess')
      .mockReturnValue(null);
    const bus = createMockMessageBus();
    const invocation =
      kind === 'verified'
        ? new VerifiedPatchTransactionTool(config, bus).build({
            targetFile: target,
            newContent: 'MODIFIED',
          })
        : new ApplyPatchTool(config, bus).build({
            patch: '*** Begin Patch\n*** Delete File: safe.txt\n*** End Patch',
          });
    const result = await invocation.execute({
      abortSignal: AbortSignal.abort(new Error('Cancelled before patch')),
    });
    expect(result.error?.message).toBe('Cancelled before patch');
    expect(validate).not.toHaveBeenCalled();
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');
    expect(fs.readdirSync(project)).toEqual(['safe.txt']);
  },
);
