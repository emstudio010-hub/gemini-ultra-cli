/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Stop waiting without allowing a late, non-cancellable read to publish state. */
export async function withAbortSignal<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const result = await Promise.race([operation(), cancelled]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
