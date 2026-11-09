/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentResponse,
  GenerateContentResponse,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

/** External-only authentication must never silently submit unresolved requests to Google. */
export class ExternalFallbackGenerator implements ContentGenerator {
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return Promise.resolve({
      totalTokens: Math.ceil(JSON.stringify(request.contents || '').length / 3),
    });
  }
  generateContent(): Promise<GenerateContentResponse> {
    return Promise.reject(
      new Error(
        'No external provider can resolve this model. Select a configured model with /provider.',
      ),
    );
  }
  generateContentStream(): Promise<AsyncGenerator<GenerateContentResponse>> {
    return Promise.reject(
      new Error(
        'No external provider can resolve this model. Select a configured model with /provider.',
      ),
    );
  }
  embedContent(): Promise<EmbedContentResponse> {
    return Promise.reject(
      new Error(
        'The selected external provider does not configure an embedding endpoint.',
      ),
    );
  }
}
