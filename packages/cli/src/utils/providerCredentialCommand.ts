/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const credentialPrefix =
  /^(\s*\/\s*(?:provider|供应商|接口|p)\s+(?:add|添加))(?=\s|$)/iu;

/** Detect before command discovery so sensitive inputs never fall through to a model. */
export function isProviderCredentialCommand(input: string): boolean {
  return credentialPrefix.test(input);
}

/** For display/trace only. Execution must continue to receive the original input. */
export function redactProviderCredentialCommand(input: string): string {
  const match = credentialPrefix.exec(input);
  if (!match) return input;
  return match[1] + (input.slice(match[0].length).trim() ? ' ***' : '');
}
