/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it } from 'vitest';
import {
  isProviderCredentialCommand,
  redactProviderCredentialCommand,
} from './providerCredentialCommand.js';
it('matches parser whitespace and aliases while leaving ordinary paths and commands unchanged', () => {
  for (const command of [
    '/ provider\tadd',
    ' /P ADD',
    '/供应商 添加',
    '/接口 add',
  ]) {
    const raw = command + ' Fixture https://fixture.invalid FAKE_KEY';
    expect(isProviderCredentialCommand(raw)).toBe(true);
    expect(redactProviderCredentialCommand(raw)).toBe(command + ' ***');
  }
  for (const command of [
    '/provider list',
    '/provider additional foo',
    '/p use fixture',
    '/providers add fake',
    '/home/user/file.txt',
    'Discuss /provider add usage',
  ]) {
    expect(isProviderCredentialCommand(command)).toBe(false);
    expect(redactProviderCredentialCommand(command)).toBe(command);
  }
});
