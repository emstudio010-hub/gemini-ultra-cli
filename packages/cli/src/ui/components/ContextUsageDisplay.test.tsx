/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { describe, it, expect, vi } from 'vitest';
import { makeFakeConfig, type ContentGenerator } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    tokenLimit: (model: string, generator?: ContentGenerator) =>
      generator?.getModelContextWindow?.(model) ?? 10000,
  };
});

describe('ContextUsageDisplay', () => {
  it('renders the configured route capacity', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'getContentGenerator').mockReturnValue({
      getModelContextWindow: () => 8000,
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    });
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={6000}
        model="external-model"
        terminalWidth={120}
      />,
      {
        config,
      },
    );
    expect(lastFrame()).toContain('75% used');
    unmount();
  });

  it('renders correct percentage used', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={5000}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('50% used');
    unmount();
  });

  it('renders correctly when usage is 0%', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={0}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('0% used');
    unmount();
  });

  it('renders abbreviated label when terminal width is small', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={2000}
        model="gemini-pro"
        terminalWidth={80}
      />,
      { width: 80 },
    );
    const output = lastFrame();
    expect(output).toContain('20%');
    expect(output).not.toContain('context used');
    unmount();
  });

  it('renders 80% correctly', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={8000}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('80% used');
    unmount();
  });

  it('renders 100% when full', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ContextUsageDisplay
        promptTokenCount={10000}
        model="gemini-pro"
        terminalWidth={120}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('100% used');
    unmount();
  });
});
