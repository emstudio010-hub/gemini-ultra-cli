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
  const engine = getSwarmEngine(root, swarm.id, async () => ({
    completed: true,
    text: 'Investigation complete.',
  }));
  engine.add('reader', 'researcher', 'Read the assigned source.');
  await engine.wait(new AbortController().signal);
  const onClose = vi.fn();
  const rendered = await renderWithProviders(
    <SwarmBoard root={root} id={swarm.id} onClose={onClose} />,
  );
  try {
    expect(rendered.lastFrame()).toContain('@reader');
    expect(rendered.lastFrame()).toContain('waiting');
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
