/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** A local routing configuration failure, before any provider dispatch. */
export class ProviderRouteError extends Error {
  override readonly name = 'ProviderRouteError';
}
