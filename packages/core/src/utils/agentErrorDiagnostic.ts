/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { sanitizeErrorMessage } from './agent-sanitization-utils.js';
import { isRecord } from './markdownUtils.js';

function readField(value: unknown, key: string): unknown {
  try {
    if (typeof value === 'function')
      return key === 'name' ? value.name : undefined;
    return isRecord(value) ? value[key] : undefined;
  } catch {
    return undefined;
  }
}

export function safeAgentErrorMessage(error: unknown): string {
  const message = readField(error, 'message');
  if (typeof message === 'string') return sanitizeErrorMessage(message);
  try {
    return sanitizeErrorMessage(String(error));
  } catch {
    return 'Unknown error';
  }
}

/** Copy only diagnostic scalars; never retain provider objects or raw causes. */
export function safeAgentErrorMetadata(
  error: unknown,
  includeStack = false,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (error instanceof Error) {
    const name = readField(readField(error, 'constructor'), 'name');
    if (
      typeof name === 'string' &&
      /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(name)
    )
      meta['errorName'] = name;
    const stack = includeStack ? readField(error, 'stack') : undefined;
    if (typeof stack === 'string') meta['stack'] = sanitizeErrorMessage(stack);
  }
  const exitCode = readField(error, 'exitCode');
  if (typeof exitCode === 'number' && Number.isSafeInteger(exitCode))
    meta['exitCode'] = exitCode;
  for (const key of ['code', 'status'] as const) {
    const value = readField(error, key);
    if (typeof value === 'number' && Number.isSafeInteger(value))
      meta[key] = value;
    else if (typeof value === 'string' && value.length <= 256)
      meta[key] = sanitizeErrorMessage(value);
  }
  return meta;
}
