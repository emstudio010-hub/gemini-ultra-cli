/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from 'node:crypto';
import type { Content, Part } from '@google/genai';
import type { ExternalProviderProfile } from './providerTypes.js';

const REASONING_PREFIX = 'ultra-chat-reasoning-v1:';
const REASONING_SIGNATURE = /^ultra-chat-reasoning-v1:[a-f0-9]{64}$/;

export function shouldReplayReasoning(
  provider: ExternalProviderProfile,
  model: string,
): boolean {
  return (
    provider.protocol === 'openai-chat' &&
    provider.reasoningReplay !== 'off' &&
    (provider.reasoningReplay === 'on' ||
      /(?:^|[/:])deepseek(?:[-/]|$)/i.test(model))
  );
}

/** Bind continuation data to the endpoint/model that produced it, without storing credentials. */
export function providerReasoningSignature(
  provider: ExternalProviderProfile,
  model: string,
): string {
  return (
    REASONING_PREFIX +
    createHash('sha256')
      .update(
        JSON.stringify([
          provider.id,
          provider.baseUrl,
          provider.protocol,
          model,
        ]),
      )
      .digest('hex')
  );
}

export function isProviderReasoningPart(part: Part): boolean {
  return (
    part.thought === true &&
    typeof part.text === 'string' &&
    typeof part.thoughtSignature === 'string' &&
    REASONING_SIGNATURE.test(part.thoughtSignature)
  );
}

/** Native Gemini requests must not receive another protocol's continuation data. */
export function stripProviderReasoning(contents: Content[]): Content[] {
  return contents.flatMap((content) => {
    const original = content.parts ?? [];
    let changed = false;
    const parts = original.flatMap((part) => {
      if (isProviderReasoningPart(part)) {
        changed = true;
        return [];
      }
      if (
        typeof part.thoughtSignature === 'string' &&
        REASONING_SIGNATURE.test(part.thoughtSignature)
      ) {
        changed = true;
        const { thoughtSignature: _signature, ...rest } = part;
        void _signature;
        return [rest];
      }
      return [part];
    });
    if (!changed) return [content];
    return parts.length ? [{ ...content, parts }] : [];
  });
}
