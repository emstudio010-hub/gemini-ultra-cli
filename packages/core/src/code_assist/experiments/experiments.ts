/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type { ListExperimentsResponse, Flag } from './types.js';
import * as fs from 'node:fs';
import { debugLogger } from '../../utils/debugLogger.js';
import { withAbortSignal } from '../../utils/withAbortSignal.js';

export interface Experiments {
  flags: Record<string, Flag>;
  experimentIds: number[];
}

const experimentsByServer = new WeakMap<
  CodeAssistServer,
  Promise<Experiments>
>();

/**
 * Gets the experiments from the server.
 *
 * Share successful and in-flight reads only for the same native backend.
 * Failed reads may be retried by a later explicit caller.
 */
export async function getExperiments(
  server?: CodeAssistServer,
): Promise<Experiments> {
  const cached = server ? experimentsByServer.get(server) : undefined;
  if (cached) {
    return cached;
  }

  if (!server && !process.env['GEMINI_EXP']) {
    return { flags: {}, experimentIds: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('Experiments loading timed out')),
    10_000,
  );
  const promise = withAbortSignal(controller.signal, async () => {
    if (process.env['GEMINI_EXP']) {
      try {
        const expPath = process.env['GEMINI_EXP'];
        debugLogger.debug('Reading experiments from', expPath);
        const content = await withAbortSignal(controller.signal, () =>
          fs.promises.readFile(expPath, 'utf8'),
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: ListExperimentsResponse = JSON.parse(content);
        if (
          (response.flags && !Array.isArray(response.flags)) ||
          (response.experimentIds && !Array.isArray(response.experimentIds))
        ) {
          throw new Error(
            'Invalid format for experiments file: `flags` and `experimentIds` must be arrays if present.',
          );
        }
        return parseExperiments(response);
      } catch (e) {
        debugLogger.debug('Failed to read experiments from GEMINI_EXP', e);
      }
    }

    controller.signal.throwIfAborted();
    if (!server) {
      return { flags: {}, experimentIds: [] };
    }

    const metadata = await withAbortSignal(
      controller.signal,
      getClientMetadata,
    );
    const response = await server.listExperiments(metadata, controller.signal);
    return parseExperiments(response);
  }).finally(() => clearTimeout(timeout));
  if (server) experimentsByServer.set(server, promise);
  try {
    return await promise;
  } catch (error) {
    if (server && experimentsByServer.get(server) === promise) {
      experimentsByServer.delete(server);
    }
    throw error;
  }
}

function parseExperiments(response: ListExperimentsResponse): Experiments {
  const flags: Record<string, Flag> = {};
  for (const flag of response.flags ?? []) {
    if (flag.flagId) {
      flags[flag.flagId] = flag;
    }
  }
  return {
    flags,
    experimentIds: response.experimentIds ?? [],
  };
}
