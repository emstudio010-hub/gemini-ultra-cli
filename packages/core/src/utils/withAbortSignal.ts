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
    // A synchronous operation can abort its signal and then throw. Attach both
    // rejections to the race even in that case, avoiding an unobserved abort.
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      pending = Promise.reject(error);
    }
    const result = await Promise.race([pending, cancelled]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
