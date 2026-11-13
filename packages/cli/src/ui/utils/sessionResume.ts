/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { escapeShellArg } from '@google/gemini-cli-core';

/** Copyable commands for the distributed Ultra CLI, without executing them. */
export function sessionResumeCommands(
  sessionId: string,
  worktreePath: string | undefined,
  windows: boolean,
) {
  const shell = windows ? 'powershell' : 'bash';
  const escapedId = escapeShellArg(sessionId, shell);
  const quotedId =
    windows && !escapedId.startsWith('"') && !escapedId.startsWith("'")
      ? `"${escapedId}"`
      : escapedId;
  const resume = `gemini-ultra --resume ${quotedId}`;
  if (!worktreePath) return { resume };
  const directory = escapeShellArg(worktreePath, shell);
  return {
    resume,
    // PowerShell 5.1 has no &&, and -LiteralPath keeps brackets literal.
    // Resume only after Set-Location succeeded, including permission failures.
    resumeWorktree: windows
      ? `Set-Location -LiteralPath ${directory}; if ($?) { ${resume} }`
      : `cd -- ${directory} && ${resume}`,
    removeWorktree: `git worktree remove -- ${directory}`,
  };
}
