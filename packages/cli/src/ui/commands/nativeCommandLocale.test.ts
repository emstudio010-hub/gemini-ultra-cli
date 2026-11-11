/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  I18nManager,
  readDrillGrant,
  writeDrillGrant,
  runDrillPreflight,
  DrillStore,
  readUltraRuntime,
  saveUltraRuntime,
} from '@google/gemini-cli-core';
import open from 'open';
import { teamCommand } from './teamCommand.js';
import { redteamCommand } from './redteamCommand.js';
import { drillCommand } from './drillCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  startDrillCockpit,
  stopDrillCockpit,
} from '../../services/drillCockpit.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/gemini-cli-core')>()),
  readDrillGrant: vi.fn(),
  writeDrillGrant: vi.fn(),
  runDrillPreflight: vi.fn(),
  readUltraRuntime: vi.fn(),
  saveUltraRuntime: vi.fn(),
  DrillStore: { getInstance: vi.fn() },
}));
vi.mock('open', () => ({ default: vi.fn() }));
vi.mock('../../services/drillCockpit.js', () => ({
  startDrillCockpit: vi.fn(),
  stopDrillCockpit: vi.fn(),
}));

let root: string;
beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-command-locale-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  I18nManager.getInstance().setLocale('en');
  vi.mocked(readUltraRuntime).mockReturnValue({
    collaboration: 'auto',
    maxParallel: 3,
    workflow: 'general',
  });
  vi.mocked(readDrillGrant).mockReturnValue({
    path: 'fixture-grant.json',
    granted: false,
    allowedNetScope: ['127.0.0.1/32'],
  });
  vi.mocked(writeDrillGrant).mockReturnValue({
    path: 'fixture-grant.json',
    at: '2026-11-11T00:00:00Z',
    granted: true,
    allowedNetScope: ['127.0.0.1/32'],
  });
  vi.mocked(DrillStore.getInstance).mockReturnValue({
    queryFacts: vi.fn(() => []),
  } as unknown as DrillStore);
  vi.mocked(runDrillPreflight).mockResolvedValue({
    granted: false,
    allowedNetScope: ['127.0.0.1/32'],
    tools: {
      r2: { available: true, pathOrStatus: 'C:/工具/r2.exe' },
      ghidra: { available: false, pathOrStatus: 'user diagnostic 文本' },
    },
  } as Awaited<ReturnType<typeof runDrillPreflight>>);
  vi.mocked(startDrillCockpit).mockResolvedValue('http://127.0.0.1:45678/');
  vi.mocked(open).mockResolvedValue({} as Awaited<ReturnType<typeof open>>);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
const chinese = /[\u4e00-\u9fff]/;
const messages = (context: ReturnType<typeof createMockCommandContext>) =>
  vi
    .mocked(context.ui.addItem)
    .mock.calls.map(([item]) => ('text' in item ? item.text : ''))
    .join('\n');
const drill = (name: string) =>
  drillCommand.subCommands!.find((command) => command.name === name)!;

it('reads every native command and drill subcommand description from the current locale', () => {
  const commands = [
    teamCommand,
    redteamCommand,
    drillCommand,
    ...drillCommand.subCommands!,
  ];
  for (const command of commands)
    expect(command.description).not.toMatch(chinese);
  I18nManager.getInstance().setLocale('zh');
  for (const command of commands) expect(command.description).toMatch(chinese);
});

it('localizes status and fact labels while preserving every user fact and diagnostic field', async () => {
  const context = createMockCommandContext();
  const values = [
    '用户事实标题',
    'raw evidence payload',
    '原始内容',
    'C:/样本/fixture.bin',
    '用户二进制记录',
    'original payload note',
    '漏洞用户标题',
    '原始状态',
  ];
  const queryFacts = vi.fn(() => [
    {
      factType: 'note',
      id: 1,
      title: values[0],
      evidence: values[1],
      content: values[2],
    },
    {
      factType: 'binary',
      id: 2,
      sample_path: values[3],
      sha256: 'a'.repeat(64),
      file_type: 'PE',
      entropy: 1.25,
      is_packed: false,
    },
    { factType: 'binary', title: values[4], content: values[5] },
    {
      factType: 'vuln',
      id: 3,
      title: values[6],
      severity: 'low',
      cve: 'CVE-user',
      status: values[7],
    },
  ]);
  vi.mocked(DrillStore.getInstance).mockReturnValue({
    queryFacts,
  } as unknown as DrillStore);
  await drill('status').action!(context, '');
  await drill('facts').action!(context, '用户关键字');
  const output = messages(context);
  for (const value of values) expect(output).toContain(value);
  expect(output).toContain('a'.repeat(64));
  expect(output).toContain('127.0.0.1/32');
  expect(output).toContain('CVE-user');
  expect(
    values.reduce((text, value) => text.replaceAll(value, ''), output),
  ).not.toMatch(chinese);
  expect(queryFacts).toHaveBeenLastCalledWith(undefined, '用户关键字');
});

it('localizes drill actions including browser failure while preserving tool paths and side effects', async () => {
  const context = createMockCommandContext();
  await drill('preflight').action!(context, '');
  await drill('grant').action!(context, '');
  await drill('stop').action!(context, '');
  vi.mocked(open).mockRejectedValueOnce(new Error('fixture browser failure'));
  await drillCommand.action!(context, '');
  await drillCommand.action!(context, 'unknown-operation');
  const output = messages(context);
  expect(output).toContain('C:/工具/r2.exe');
  expect(output).toContain('user diagnostic 文本');
  expect(
    output
      .replaceAll('C:/工具/r2.exe', '')
      .replaceAll('user diagnostic 文本', ''),
  ).not.toMatch(chinese);
  expect(writeDrillGrant).toHaveBeenCalledWith(true);
  expect(stopDrillCockpit).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledWith('http://127.0.0.1:45678/');
});

it('retains the red-team grant gate and collaboration limits', async () => {
  const context = createMockCommandContext();
  await redteamCommand.action!(context, 'on');
  expect(saveUltraRuntime).not.toHaveBeenCalled();
  await teamCommand.action!(context, 'team 9');
  expect(saveUltraRuntime).not.toHaveBeenCalled();
  await teamCommand.action!(context, 'team 2');
  expect(saveUltraRuntime).toHaveBeenLastCalledWith({
    collaboration: 'team',
    maxParallel: 2,
    workflow: 'general',
  });
  vi.mocked(readDrillGrant).mockReturnValue({
    path: 'fixture-grant.json',
    granted: true,
    allowedNetScope: ['127.0.0.1/32'],
  });
  await redteamCommand.action!(context, 'on');
  expect(saveUltraRuntime).toHaveBeenLastCalledWith({
    collaboration: 'auto',
    maxParallel: 3,
    workflow: 'redteam',
  });
});
