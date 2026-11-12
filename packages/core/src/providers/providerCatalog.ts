/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export class ProviderCatalogSizeError extends Error {
  constructor() {
    super(
      'Model catalog exceeds the 2 MiB response limit. Enter model IDs manually.',
    );
  }
}

/** Bound decoded response bytes before JSON parsing; cancellation covers body reads. */
export async function readProviderCatalog(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new ProviderCatalogSizeError();
  }
  if (!response.body) {
    signal.throwIfAborted();
    throw new SyntaxError('Empty model catalog response.');
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal.aborted) {
      cancel();
      signal.throwIfAborted();
    }
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CATALOG_BYTES) throw new ProviderCatalogSizeError();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
