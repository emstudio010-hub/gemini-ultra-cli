/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Keep native integer lexemes that cannot be represented exactly by Number. */
export function parseNativeBinaryJson(text: string): unknown {
  return JSON.parse(
    text,
    (_key: string, value: unknown, context?: { source?: string }) => {
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value)))
      ) {
        if (!context?.source)
          throw new Error(
            'The runtime cannot preserve native integer precision.',
          );
        return context.source;
      }
      return value;
    },
  );
}
