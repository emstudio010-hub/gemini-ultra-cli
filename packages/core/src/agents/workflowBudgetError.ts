/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** A saved workflow's local budget boundary, not a failed provider call. */
export class WorkflowBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowBudgetError';
  }
}
