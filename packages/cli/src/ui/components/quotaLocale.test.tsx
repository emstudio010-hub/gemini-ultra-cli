/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import { Box } from 'ink';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { I18nManager } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ModelQuotaDisplay } from './ModelQuotaDisplay.js';
import { QuotaDisplay } from './QuotaDisplay.js';
import { QuotaStatsInfo } from './QuotaStatsInfo.js';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-quota-locale-'));
  vi.stubEnv('GEMINI_ULTRA_LOCALE_FILE', path.join(root, 'locale.json'));
  vi.stubEnv('TZ', 'UTC');
  I18nManager.getInstance().setLocale('en');
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
it('updates quota labels and reset durations in both languages without changing supplied data', async () => {
  const resetTime = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const buckets = [
    { modelId: 'gemini-2.5-pro', remainingFraction: 0.15, resetTime },
  ];
  const original = JSON.stringify(buckets);
  const rendered = await renderWithProviders(
    <Box flexDirection="column">
      <ModelQuotaDisplay buckets={buckets} />
      <QuotaDisplay
        remaining={15}
        limit={100}
        resetTime={resetTime}
        forceShow
      />
      <QuotaStatsInfo remaining={15} limit={100} resetTime={resetTime} />
    </Box>,
    { width: 130 },
  );
  try {
    expect(rendered.lastFrame()).toContain('Model usage');
    expect(rendered.lastFrame()).toContain('Resets:');
    await act(async () => {
      I18nManager.getInstance().setLocale('zh');
    });
    await waitFor(() => expect(rendered.lastFrame()).toContain('模型用量'));
    const chinese = rendered.lastFrame();
    expect(chinese).toContain('重置：');
    expect(chinese).toContain('已用 85%');
    expect(chinese).toContain('用量上限：100');
    expect(chinese).toContain('分钟');
    expect(chinese).not.toContain('Resets:');
    expect(chinese).not.toContain('Model usage');
    expect(chinese).not.toContain('reset daily');
    await act(async () => {
      I18nManager.getInstance().setLocale('en');
    });
    await waitFor(() => expect(rendered.lastFrame()).toContain('85% used'));
    expect(rendered.lastFrame()).toContain('reported by your provider');
    expect(rendered.lastFrame()).not.toContain('reset daily');
    expect(JSON.stringify(buckets)).toBe(original);
  } finally {
    rendered.unmount();
  }
});

it.each(['not-a-date', '2000-01-01T00:00:00Z'])(
  'does not print an empty reset claim for %s',
  async (resetTime) => {
    const rendered = await renderWithProviders(
      <Box flexDirection="column">
        <ModelQuotaDisplay
          buckets={[{ modelId: 'fixture', remainingFraction: 0, resetTime }]}
        />
        <QuotaDisplay remaining={0} limit={100} resetTime={resetTime} />
        <QuotaStatsInfo
          remaining={0}
          limit={100}
          resetTime={resetTime}
          showDetails={false}
        />
      </Box>,
    );
    try {
      expect(rendered.lastFrame()).toContain('Limit reached');
      expect(rendered.lastFrame()).not.toContain('resets in');
      expect(rendered.lastFrame()).not.toContain('Resets:');
    } finally {
      rendered.unmount();
    }
  },
);

it.each([
  [NaN, 100],
  [-1, 100],
  [101, 100],
  [1, -100],
])(
  'omits invalid quota numbers remaining=%s limit=%s',
  async (remaining, limit) => {
    const rendered = await renderWithProviders(
      <Box flexDirection="column">
        <ModelQuotaDisplay
          buckets={[
            { modelId: 'fixture', remainingFraction: remaining / limit },
          ]}
        />
        <QuotaDisplay remaining={remaining} limit={limit} forceShow />
        <QuotaStatsInfo remaining={remaining} limit={limit} />
      </Box>,
    );
    try {
      expect(rendered.lastFrame({ allowEmpty: true }).trim()).toBe('');
    } finally {
      rendered.unmount();
    }
  },
);
