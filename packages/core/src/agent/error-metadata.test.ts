/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it } from 'vitest';
import { mapError } from './event-translator.js';
import { FatalError } from '../utils/errors.js';
import {
  safeAgentErrorMessage,
  safeAgentErrorMetadata,
} from '../utils/agentErrorDiagnostic.js';
it('projects structured errors without retaining arbitrary cyclic private fields', () => {
  const raw = {
    message: 'Request failed api_key=PRIVATE_KEY',
    status: 429,
    details: { token: 'PRIVATE_TOKEN' },
    self: undefined as unknown,
  };
  raw.self = raw;
  const mapped = mapError(raw);
  let encoded: string | undefined;
  expect(() => {
    encoded = JSON.stringify(mapped);
  }).not.toThrow();
  expect(encoded).not.toContain('PRIVATE_');
  expect(mapped._meta?.['rawError']).toEqual({
    message: 'Request failed api_key=[REDACTED]',
    status: 429,
  });
});
it('omits a cyclic code object instead of breaking report serialization', () => {
  const code: { self?: unknown } = {};
  code.self = code;
  const error = Object.assign(new Error('Fixture'), { code });
  const mapped = mapError(error);
  expect(() => JSON.stringify(mapped)).not.toThrow();
  expect(mapped._meta).not.toHaveProperty('code');
});
it('omits BigInt status instead of breaking report serialization', () => {
  const mapped = mapError(
    Object.assign(new Error('Fixture'), { status: 123n }),
  );
  expect(() => JSON.stringify(mapped)).not.toThrow();
  expect(mapped._meta).not.toHaveProperty('status');
});
it('redacts credential patterns in string error codes', () => {
  const mapped = mapError(
    Object.assign(new Error('Fixture'), { code: 'token=PRIVATE_CODE' }),
  );
  expect(JSON.stringify(mapped)).not.toContain('PRIVATE_');
  expect(mapped._meta?.['code']).toBe('token=[REDACTED]');
});
it('redacts the visible Error message', () => {
  expect(
    mapError(new Error('Request failed token=PRIVATE_TOKEN')).message,
  ).toBe('Request failed token=[REDACTED]');
});
it('preserves valid structured status and code for CLI reconstruction', () => {
  const mapped = mapError({
    message: 'Rate limit',
    status: 429,
    code: 'RESOURCE_EXHAUSTED',
  });
  expect(mapped.status).toBe('RESOURCE_EXHAUSTED');
  expect(mapped._meta?.['rawError']).toEqual({
    message: 'Rate limit',
    status: 429,
    code: 'RESOURCE_EXHAUSTED',
  });
});
it('preserves FatalError identity and exit code', () => {
  expect(mapError(new FatalError('Disk full', 44))._meta).toMatchObject({
    errorName: 'FatalError',
    exitCode: 44,
  });
});
it('retains useful scalar metadata with a redacted stack and leaves the source unchanged', () => {
  const error = Object.assign(new Error('Fixture token=PRIVATE_STACK'), {
    code: 'ENOENT',
    status: 429,
    exitCode: 17,
  });
  const meta = safeAgentErrorMetadata(error, true);
  expect(meta).toMatchObject({
    errorName: 'Error',
    code: 'ENOENT',
    status: 429,
    exitCode: 17,
  });
  expect(meta['stack']).toContain('[REDACTED]');
  expect(JSON.stringify(meta)).not.toContain('PRIVATE_');
  expect(error.message).toContain('PRIVATE_STACK');
});
it('ignores unreadable diagnostic getters without replacing the original error', () => {
  const error = new Error('Original failure');
  for (const key of ['code', 'status', 'stack'])
    Object.defineProperty(error, key, {
      get() {
        throw Error('PRIVATE_GETTER');
      },
    });
  expect(safeAgentErrorMetadata(error, true)).toEqual({ errorName: 'Error' });
  expect(safeAgentErrorMessage(error)).toBe('Original failure');
});
it('omits nonfinite numeric and oversized string metadata', () => {
  const meta = safeAgentErrorMetadata(
    Object.assign(new Error('Fixture'), {
      code: 'x'.repeat(257),
      status: Infinity,
      exitCode: NaN,
    }),
  );
  expect(meta).toEqual({ errorName: 'Error' });
});
