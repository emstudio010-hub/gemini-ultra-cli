/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  I18nManager,
  ToolCallDecision,
  LlmRole,
} from '@google/gemini-cli-core';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { StatsDisplay } from './StatsDisplay.js';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
import {
  type SessionMetrics,
  useSessionStats,
} from '../contexts/SessionContext.js';

vi.mock('../contexts/SessionContext.js', async (original) => ({
  ...(await original<typeof import('../contexts/SessionContext.js')>()),
  useSessionStats: vi.fn(),
}));
vi.mock('../contexts/SettingsContext.js', async (original) => ({
  ...(await original<typeof import('../contexts/SettingsContext.js')>()),
  useSettings: () => ({ merged: { ui: { showUserIdentity: true } } }),
}));
const tokens = {
  input: 120,
  prompt: 100,
  candidates: 30,
  total: 150,
  cached: 20,
  thoughts: 5,
  tool: 3,
};
const metrics: SessionMetrics = {
  models: {
    'fixture:model@v1': {
      api: { totalRequests: 2, totalErrors: 1, totalLatencyMs: 2000 },
      tokens,
      roles: {
        [LlmRole.MAIN]: {
          totalRequests: 2,
          totalErrors: 1,
          totalLatencyMs: 2000,
          tokens,
        },
      },
    },
  },
  tools: {
    totalCalls: 2,
    totalSuccess: 1,
    totalFail: 1,
    totalDurationMs: 400,
    totalDecisions: {
      accept: 1,
      reject: 1,
      modify: 0,
      [ToolCallDecision.AUTO_ACCEPT]: 0,
    },
    byName: {
      read_file: {
        count: 2,
        success: 1,
        fail: 1,
        durationMs: 400,
        decisions: {
          accept: 1,
          reject: 1,
          modify: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
      },
    },
  },
  files: { totalLinesAdded: 3, totalLinesRemoved: 1 },
};
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-stats-locale-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  I18nManager.getInstance().setLocale('en');
  vi.mocked(useSessionStats).mockReturnValue({
    stats: {
      sessionId: 'fixture-session',
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 1,
    },
    getPromptCount: () => 1,
    startNewPrompt: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  {
    name: 'session',
    view: () => (
      <StatsDisplay
        duration="2s"
        selectedAuthType="oauth-personal"
        userEmail="fixture@example.invalid"
        tier="Fixture tier"
      />
    ),
    english: ['Session Stats', 'Interaction Summary', 'Model Usage'],
    chinese: [
      '会话统计',
      '交互概览',
      '模型用量',
      '认证方式：',
      '通过 Google 登录',
      '工具调用：',
      '请求数',
      '输入 Token',
      '主代理',
    ],
  },
  {
    name: 'model',
    view: () => (
      <ModelStatsDisplay
        selectedAuthType="oauth-personal"
        userEmail="fixture@example.invalid"
        tier="Fixture tier"
      />
    ),
    english: ['Model Stats For Nerds', 'Avg Latency', 'Cache Reads'],
    chinese: [
      '模型详细统计',
      '平均延迟',
      '缓存读取',
      '指标',
      '错误',
      '角色',
      '主代理',
      '认证方式：',
    ],
  },
  {
    name: 'tools',
    view: () => <ToolStatsDisplay />,
    english: ['Tool Stats For Nerds', 'User Decision Summary'],
    chinese: [
      '工具详细统计',
      '用户决策汇总',
      '工具名称',
      '平均耗时',
      '已接受：',
      '已拒绝：',
      '总体同意率：',
    ],
  },
])(
  'switches $name stats English to Chinese and back without changing metrics',
  async ({ view, english, chinese }) => {
    const before = JSON.stringify(metrics);
    const screen = await render(view(), 140);
    try {
      english.forEach((label) => expect(screen.lastFrame()).toContain(label));
      await act(async () => I18nManager.getInstance().setLocale('zh'));
      await waitFor(() => expect(screen.lastFrame()).toContain(chinese[0]));
      chinese.forEach((label) => expect(screen.lastFrame()).toContain(label));
      english.forEach((label) =>
        expect(screen.lastFrame()).not.toContain(label),
      );
      await act(async () => I18nManager.getInstance().setLocale('en'));
      await waitFor(() => expect(screen.lastFrame()).toContain(english[0]));
      expect(JSON.stringify(metrics)).toBe(before);
      expect(screen.lastFrame()).toContain(
        view().type === ToolStatsDisplay ? 'read_file' : 'fixture:model@v1',
      );
    } finally {
      screen.unmount();
    }
  },
);

it.each([
  { view: () => <ModelStatsDisplay />, label: '本会话尚未发起 API 请求。' },
  { view: () => <ToolStatsDisplay />, label: '本会话尚未调用工具。' },
])('localizes the empty stats state: $label', async ({ view, label }) => {
  vi.mocked(useSessionStats).mockReturnValue({
    stats: {
      sessionId: 'empty',
      sessionStartTime: new Date(),
      metrics: {
        ...metrics,
        models: {},
        tools: { ...metrics.tools, byName: {} },
      },
      lastPromptTokenCount: 0,
      promptCount: 0,
    },
    getPromptCount: () => 0,
    startNewPrompt: vi.fn(),
  });
  I18nManager.getInstance().setLocale('zh');
  const screen = await render(view(), 100);
  try {
    expect(screen.lastFrame()).toContain(label);
  } finally {
    screen.unmount();
  }
});
