/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Process every item with a bounded worker count, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Math.floor(limit)), items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          results[index] = await run(items[index], index);
        }
      },
    ),
  );
  return results;
}
