/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import {
  createSwarm,
  getSwarmEngine,
  I18nManager,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { SwarmBoard } from './SwarmBoard.js';

it('renders the saved roster, refreshes public posts and closes with Escape', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-board-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  const i18n = I18nManager.getInstance();
  const previousLocale = i18n.getLocale();
  i18n.setLocale('en');
  const swarm = createSwarm(root, 'Public swarm evidence');
  fs.writeFileSync(path.join(root, 'REPORT.md'), 'Reviewed bytes');
  const engine = getSwarmEngine(
    root,
    swarm.id,
    async (agent) => ({
      completed: true,
      text:
        agent === 'workflow-auditor'
          ? JSON.stringify({
              passed: true,
              summary: 'Inspected report',
              evidence: ['REPORT.md'],
            })
          : 'Investigation complete.',
    }),
    root,
  );
  engine.add('reader', 'researcher', 'Read the assigned source.');
  await engine.wait(new AbortController().signal);
  engine.add('auditor', 'workflow-auditor', 'Inspect REPORT.md', ['REPORT.md']);
  await engine.wait(new AbortController().signal);
  // The UI describes a saved snapshot, even after the real file disappears.
  fs.unlinkSync(path.join(root, 'REPORT.md'));
  const memberFile = path.join(root, 'swarms', swarm.id, 'members.json');
  const savedMembers = JSON.parse(fs.readFileSync(memberFile, 'utf8'));
  Object.assign(savedMembers.members[0], {
    failureHistoryIncomplete: true,
    failedAttempts: [
      {
        turn: 1,
        outcome: 'error',
        fullResult: { sha256: 'a'.repeat(64), bytes: 10, chars: 10 },
      },
    ],
  });
  fs.writeFileSync(memberFile, JSON.stringify(savedMembers));
  const onClose = vi.fn();
  const rendered = await renderWithProviders(
    <SwarmBoard root={root} id={swarm.id} onClose={onClose} />,
  );
  try {
    expect(rendered.lastFrame()).toContain('@reader');
    expect(rendered.lastFrame()).toContain('waiting');
    expect(rendered.lastFrame()).toContain('Review scope: 1 file');
    expect(rendered.lastFrame()).toContain('snapshot saved');
    expect(rendered.lastFrame()).toContain('Snapshots are historical');
    expect(rendered.lastFrame()).toContain('Failed attempts: 1');
    expect(rendered.lastFrame()).toContain(
      'History incomplete; full export unavailable',
    );
    engine.post('coordinator', 'UPDATED_ENTRY\u001b[2J');
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('UPDATED_ENTRY'),
    );
    expect(rendered.lastFrame()).not.toContain('[2J');
    const stateFile = path.join(root, 'swarms', swarm.id, 'members.json');
    const beforeLocaleChange = fs.readFileSync(stateFile);
    await act(async () => {
      i18n.setLocale('zh');
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('蜂群 · 进行中'),
    );
    expect(rendered.lastFrame()).toContain('@reader [等待] 继承主模型');
    expect(rendered.lastFrame()).not.toContain('[waiting]');
    expect(rendered.lastFrame()).not.toContain('inherit');
    expect(rendered.lastFrame()).toContain('复核范围：1 个文件');
    expect(rendered.lastFrame()).toContain('快照已保存');
    expect(rendered.lastFrame()).toContain('快照是历史记录');
    expect(rendered.lastFrame()).toContain('失败历史：1 次');
    expect(rendered.lastFrame()).toContain('历史不完整，完整导出不可用');
    expect(fs.readFileSync(stateFile).equals(beforeLocaleChange)).toBe(true);
    await act(async () => {
      i18n.setLocale('en');
    });
    await waitFor(() =>
      expect(rendered.lastFrame()).toContain('@reader [waiting] inherit'),
    );
    await act(async () => {
      rendered.stdin.write('\u001b');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  } finally {
    rendered.unmount();
    i18n.setLocale(previousLocale);
    vi.unstubAllEnvs();
    engine.cancel();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
