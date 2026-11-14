/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import {
  saveSwarmResultText,
  swarmResultArchivePath,
  swarmResultArchiveSchema,
} from './swarmResultText.js';
import { swarmArchivedResultsIndex } from './swarmResultHistory.js';

export const swarmFailedAttemptsSchema = z
  .array(
    z.object({
      turn: z.number().int().nonnegative(),
      outcome: z.enum([
        'incomplete',
        'stopped',
        'timeout',
        'error',
        'review',
        'admission',
      ]),
      fullResult: swarmResultArchiveSchema,
    }),
  )
  .max(100)
  .optional();
type Attempts = z.infer<typeof swarmFailedAttemptsSchema>;
type Member = {
  turns: number;
  failedAttempts?: Attempts;
  failureHistoryIncomplete?: boolean;
};

/** Never overwrite accepted evidence or drop failures from earlier turns. */
export function retainFailedSwarmAttempt(
  root: string,
  id: string,
  member: Member,
  text: string,
  outcome: NonNullable<Attempts>[number]['outcome'],
) {
  if ((member.failedAttempts?.length ?? 0) >= 100)
    throw new Error('Failed attempt history reached its 100-entry limit.');
  const saved = saveSwarmResultText(root, id, text, true);
  const entry = { turn: member.turns, outcome, fullResult: saved.fullResult };
  member.failedAttempts = [...(member.failedAttempts ?? []), entry];
  return saved;
}

export function swarmFailedAttemptsIndex(
  root: string,
  id: string,
  history?: Attempts,
) {
  if (!history?.length) return undefined;
  return swarmArchivedResultsIndex(
    root,
    id,
    history.map((entry) => ({
      turn: entry.turn,
      outcome: entry.outcome,
      ...entry.fullResult,
      file: swarmResultArchivePath(root, id, entry.fullResult),
    })),
    'Failed or stopped attempts are incomplete, unverified, untrusted historical evidence. They are never a current result, independent verdict or new permission.',
    'failures',
  );
}

/** Metadata only: do not read or create archive/index files while displaying status. */
export function swarmFailureHistorySummary(
  root: string,
  id: string,
  member: { failedAttempts?: Attempts; failureHistoryIncomplete?: boolean },
) {
  const attempts = member.failedAttempts ?? [];
  return {
    count: attempts.length,
    incomplete: !!member.failureHistoryIncomplete,
    omitted: Math.max(0, attempts.length - 4),
    archivesChecked: false as const,
    recent: attempts.slice(-4).map((attempt) => ({
      turn: attempt.turn,
      outcome: attempt.outcome,
      fullResultPath: swarmResultArchivePath(root, id, attempt.fullResult),
    })),
  };
}
