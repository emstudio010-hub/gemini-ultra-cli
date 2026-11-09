/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import { isRecord } from '../utils/markdownUtils.js';

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Preserve reported counters; missing usage must remain unknown rather than zero. */
export function providerUsage(
  value: unknown,
  protocol: 'openai-chat' | 'openai-responses' | 'anthropic',
): GenerateContentResponseUsageMetadata | undefined {
  const usage = record(value);
  let input = count(
    protocol === 'openai-chat' ? usage['prompt_tokens'] : usage['input_tokens'],
  );
  const output = count(
    protocol === 'openai-chat'
      ? usage['completion_tokens']
      : usage['output_tokens'],
  );
  if (input === undefined && output === undefined) return undefined;
  const inputDetails = record(
    protocol === 'openai-chat'
      ? usage['prompt_tokens_details']
      : usage['input_tokens_details'],
  );
  const outputDetails = record(
    protocol === 'openai-chat'
      ? usage['completion_tokens_details']
      : usage['output_tokens_details'],
  );
  let cached =
    count(inputDetails['cached_tokens']) ??
    count(usage['prompt_cache_hit_tokens']);
  let thoughts = count(outputDetails['reasoning_tokens']);
  if (protocol === 'anthropic') {
    cached = count(usage['cache_read_input_tokens']);
    if (input !== undefined)
      input +=
        (cached ?? 0) + (count(usage['cache_creation_input_tokens']) ?? 0);
  }
  if (cached !== undefined && input !== undefined && cached > input)
    cached = undefined;
  if (thoughts !== undefined && output !== undefined && thoughts > output)
    thoughts = undefined;
  const total =
    count(usage['total_tokens']) ??
    (input !== undefined && output !== undefined ? input + output : undefined);
  return {
    ...(input !== undefined ? { promptTokenCount: input } : {}),
    ...(output !== undefined
      ? { candidatesTokenCount: output - (thoughts ?? 0) }
      : {}),
    ...(cached !== undefined ? { cachedContentTokenCount: cached } : {}),
    ...(thoughts !== undefined ? { thoughtsTokenCount: thoughts } : {}),
    ...(total !== undefined ? { totalTokenCount: total } : {}),
  };
}
