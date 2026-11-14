/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import { CoreEvent, coreEvents } from './events.js';
import { FatalAuthenticationError } from './errors.js';
import { createWorkingStdio, writeToStdout } from './stdio.js';
import { isHeadlessMode } from './headless.js';

/**
 * Requests consent from the user for OAuth login.
 * Handles both interactive and non-interactive (headless) modes.
 */
export async function getConsentForOauth(
  prompt: string,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  const finalPrompt =
    (prompt ? prompt + ' ' : '') +
    'Opening authentication page in your browser. ';

  if (isHeadlessMode()) {
    return getOauthConsentNonInteractive(finalPrompt, signal);
  } else if (coreEvents.listenerCount(CoreEvent.ConsentRequest) > 0) {
    return getOauthConsentInteractive(finalPrompt, signal);
  }
  throw new FatalAuthenticationError(
    'Authentication consent could not be obtained.\n' +
      'Please run Gemini CLI in an interactive terminal to authenticate, ' +
      'or use NO_BROWSER=true for manual authentication.',
  );
}

async function getOauthConsentNonInteractive(
  prompt: string,
  signal?: AbortSignal,
) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: createWorkingStdio().stdout,
    terminal: true,
  });

  const fullPrompt = prompt + 'Do you want to continue? [Y/n]: ';
  writeToStdout(`\n${fullPrompt}`);

  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (answer: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      rl.close();
      if (error !== undefined) reject(error);
      else resolve(answer);
    };
    const onAbort = () => finish(false, signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    rl.on('line', (answer) => {
      finish(['y', ''].includes(answer.trim().toLowerCase()));
    });
    rl.on('close', () => finish(false));
  });
}

async function getOauthConsentInteractive(
  prompt: string,
  signal?: AbortSignal,
) {
  const fullPrompt = prompt + '\n\nDo you want to continue?';
  return new Promise<boolean>((resolve, reject) => {
    const onAbort = () => reject(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    coreEvents.emitConsentRequest({
      prompt: fullPrompt,
      ...(signal ? { signal } : {}),
      onConfirm: (confirmed: boolean) => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) return;
        resolve(confirmed);
      },
    });
  });
}
