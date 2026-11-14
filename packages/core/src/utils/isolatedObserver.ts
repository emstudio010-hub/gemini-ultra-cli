/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Observability must not change execution outcomes or prevent settlement. */
export function isolateObserver<T>(
  callback: (value: T) => void,
  onFailure: () => void,
): (value: T) => void {
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    onFailure();
  };
  return (value) => {
    if (failed) return;
    try {
      // Async functions are assignable to void callbacks. Observe rejections
      // without waiting on UI/telemetry work in the agent's execution loop.
      const pending: unknown = callback(value);
      if (pending !== undefined) void Promise.resolve(pending).catch(fail);
    } catch {
      fail();
    }
  };
}
