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
import { createSwarm, getSwarmEngine } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { SwarmBoard } from './SwarmBoard.js';

it('renders the saved roster, refreshes public posts and closes with Escape', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-board-'));
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
    await act(async () => {
      rendered.stdin.write('\u001b');
      await rendered.waitUntilReady();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  } finally {
    rendered.unmount();
    engine.cancel();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
