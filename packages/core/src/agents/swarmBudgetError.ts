/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** A local execution boundary, not a provider/network failure. */
export class SwarmBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SwarmBudgetError';
  }
}
