/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { waitFor } from '../../test-utils/async.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { type SessionMetrics } from '../contexts/SessionContext.js';
import {
  ToolCallDecision,
  isWindows,
  type WorktreeSettings,
  I18nManager,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isWindows: vi.fn(),
  };
});

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/SessionContext.js')>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

vi.mock('../contexts/ConfigContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/ConfigContext.js')>();
  return {
    ...actual,
    useConfig: vi.fn(),
  };
});

const isWindowsMock = vi.mocked(isWindows);
const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = async (
  metrics: SessionMetrics,
  sessionId = 'test-session',
  worktreeSettings?: WorktreeSettings,
) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId,
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  } as unknown as ReturnType<typeof SessionContext.useSessionStats>);

  vi.mocked(useConfig).mockReturnValue({
    getWorktreeSettings: () => worktreeSettings,
  } as never);

  const result = await renderWithProviders(
    <SessionSummaryDisplay duration="1h 23m 45s" />,
    {
      width: 100,
    },
  );
  await result.waitUntilReady();
  return result;
};

describe('<SessionSummaryDisplay />', () => {
  let localeRoot: string;
  const emptyMetrics: SessionMetrics = {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
        [ToolCallDecision.AUTO_ACCEPT]: 0,
      },
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };

  beforeEach(() => {
    localeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ultra-summary-locale-'),
    );
    vi.stubEnv(
      'GEMINI_ULTRA_LOCALE_FILE',
      path.join(localeRoot, 'locale.json'),
    );
    I18nManager.getInstance().setLocale('en');
    isWindowsMock.mockReturnValue(false);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(localeRoot, { recursive: true, force: true });
  });

  it.each([false, true])(
    'switches farewell and resume instructions in both languages with worktree=%s',
    async (worktree) => {
      isWindowsMock.mockReturnValue(true);
      const state = worktree
        ? {
            name: 'fixture',
            path: 'C:\\fixture\\[session] with space',
            baseSha: 'fixture-base',
          }
        : undefined;
      const screen = await renderWithMockedStats(
        emptyMetrics,
        'fixture-session',
        state,
      );
      try {
        expect(screen.lastFrame()).toContain('Agent powering down. Goodbye!');
        await act(async () => I18nManager.getInstance().setLocale('zh'));
        await waitFor(() =>
          expect(screen.lastFrame()).toContain('会话已结束，再见！'),
        );
        const chinese = screen.lastFrame();
        expect(chinese).toContain(
          worktree ? '恢复此工作树中的会话：' : '恢复此会话：',
        );
        expect(chinese).toContain('gemini-ultra --resume "fixture-session"');
        expect(chinese).not.toContain('To resume');
        if (worktree) {
          expect(chinese).toContain('Set-Location -LiteralPath');
          expect(chinese).toContain('手动移除此工作树：');
          expect(chinese).not.toContain('&&');
        }
        await act(async () => I18nManager.getInstance().setLocale('en'));
        await waitFor(() =>
          expect(screen.lastFrame()).toContain('Agent powering down. Goodbye!'),
        );
        expect(screen.lastFrame()).toContain(
          worktree
            ? 'To resume work in this worktree:'
            : 'To resume this session:',
        );
      } finally {
        screen.unmount();
      }
    },
  );

  it('renders the summary display with a title', async () => {
    const metrics: SessionMetrics = {
      ...emptyMetrics,
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            input: 500,
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
            tool: 200,
          },
          roles: {},
        },
      },
      files: {
        totalLinesAdded: 42,
        totalLinesRemoved: 15,
      },
    };

    const { lastFrame, unmount } = await renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).toMatchSnapshot();
    unmount();
  });

  describe('Session ID escaping', () => {
    it('renders a standard UUID-formatted session ID in the footer (bash)', async () => {
      const uuidSessionId = '1234-abcd-5678-efgh';
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        uuidSessionId,
      );
      const output = lastFrame();

      // Standard UUID characters are NOT wrapped in double quotes on non-Windows.
      expect(output).toContain('gemini-ultra --resume 1234-abcd-5678-efgh');
      unmount();
    });

    it('sanitizes a malicious session ID in the footer (bash)', async () => {
      const maliciousSessionId = "'; rm -rf / #";
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        maliciousSessionId,
      );
      const output = lastFrame();

      // escapeShellArg (using shell-quote for bash) will wrap special characters in double quotes.
      expect(output).toContain('gemini-ultra --resume "\'; rm -rf / #"');
      unmount();
    });

    it('renders a standard UUID-formatted session ID in the footer (powershell) on Windows', async () => {
      isWindowsMock.mockReturnValue(true);

      const uuidSessionId = '1234-abcd-5678-efgh';
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        uuidSessionId,
      );
      const output = lastFrame();

      // PowerShell doesn't wrap UUID in quotes by default, but we wrap it in double quotes on Windows.
      expect(output).toContain('gemini-ultra --resume "1234-abcd-5678-efgh"');
      unmount();
    });

    it('sanitizes a malicious session ID in the footer (powershell)', async () => {
      isWindowsMock.mockReturnValue(true);

      const maliciousSessionId = "'; rm -rf / #";
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        maliciousSessionId,
      );
      const output = lastFrame();

      // PowerShell wraps in single quotes and escapes internal single quotes by doubling them.
      // Since it's already quoted, we don't add redundant double quotes.
      expect(output).toContain("gemini-ultra --resume '''; rm -rf / #'");
      unmount();
    });
  });

  describe('Worktree status', () => {
    it('renders worktree instructions when worktreeSettings are present', async () => {
      const worktreeSettings: WorktreeSettings = {
        name: 'foo-bar',
        path: '/path/to/foo-bar',
        baseSha: 'base-sha',
      };

      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        'test-session',
        worktreeSettings,
      );
      const output = lastFrame();

      expect(output).toContain('To resume work in this worktree:');
      expect(output).toContain(
        'cd -- /path/to/foo-bar && gemini-ultra --resume test-session',
      );
      expect(output).toContain(
        'To remove manually: git worktree remove -- /path/to/foo-bar',
      );
      unmount();
    });
  });
});
