/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { providerUsage } from './providerUsage.js';

describe('providerUsage', () => {
  it('separates reasoning without counting it twice', () => {
    expect(
      providerUsage(
        {
          prompt_tokens: 100,
          completion_tokens: 30,
          total_tokens: 130,
          prompt_tokens_details: { cached_tokens: 20 },
          completion_tokens_details: { reasoning_tokens: 10 },
        },
        'openai-chat',
      ),
    ).toEqual({
      promptTokenCount: 100,
      candidatesTokenCount: 20,
      totalTokenCount: 130,
      cachedContentTokenCount: 20,
      thoughtsTokenCount: 10,
    });
    expect(
      providerUsage(
        {
          input_tokens: 100,
          output_tokens: 30,
          output_tokens_details: { reasoning_tokens: 10 },
        },
        'openai-responses',
      )?.totalTokenCount,
    ).toBe(130);
  });
  it('includes Anthropic cache creation and reads in the input total', () => {
    expect(
      providerUsage(
        {
          input_tokens: 12,
          cache_read_input_tokens: 8,
          cache_creation_input_tokens: 4,
          output_tokens: 9,
        },
        'anthropic',
      ),
    ).toEqual({
      promptTokenCount: 24,
      cachedContentTokenCount: 8,
      candidatesTokenCount: 9,
      totalTokenCount: 33,
    });
  });
  it('preserves unknown counters and accepts genuinely reported zeros', () => {
    expect(providerUsage(undefined, 'openai-chat')).toBeUndefined();
    expect(
      providerUsage(
        { prompt_tokens: -1, completion_tokens: '7' },
        'openai-chat',
      ),
    ).toBeUndefined();
    expect(
      providerUsage({ prompt_tokens: 0, completion_tokens: 0 }, 'openai-chat'),
    ).toEqual({
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    });
  });
  it('ignores impossible detail counters rather than producing negative output', () => {
    expect(
      providerUsage(
        {
          prompt_tokens: 5,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 100 },
          completion_tokens_details: { reasoning_tokens: 10 },
        },
        'openai-chat',
      ),
    ).toEqual({
      promptTokenCount: 5,
      candidatesTokenCount: 3,
      totalTokenCount: 8,
    });
  });
});
