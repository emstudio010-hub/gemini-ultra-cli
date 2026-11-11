/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Validate the existing snapshot contract without interpreting raw facts as XML. */
export function extractCompressionSnapshot(response: string): string | null {
  const opens = [...response.matchAll(/<state_snapshot\s*>/g)];
  const closes = [...response.matchAll(/<\/state_snapshot\s*>/g)];
  if (opens.length !== 1 || closes.length !== 1) return null;
  const start = opens[0].index;
  const end = closes[0].index;
  if (end <= start) return null;
  const prefix = response.slice(0, start);
  for (const tag of ['scratchpad', 'think']) {
    if (prefix.lastIndexOf(`<${tag}>`) > prefix.lastIndexOf(`</${tag}>`))
      return null;
  }
  const snapshot = response.slice(start, end + closes[0][0].length);
  for (const section of [
    'overall_goal',
    'active_constraints',
    'key_knowledge',
    'artifact_trail',
    'file_system_state',
    'recent_actions',
    'task_state',
  ]) {
    if (
      [...snapshot.matchAll(new RegExp(`<${section}\\s*>`, 'g'))].length !==
        1 ||
      [...snapshot.matchAll(new RegExp(`<\\/${section}\\s*>`, 'g'))].length !==
        1
    )
      return null;
    const matches = [
      ...snapshot.matchAll(
        new RegExp(`<${section}\\s*>([\\s\\S]*?)<\\/${section}\\s*>`, 'g'),
      ),
    ];
    if (matches.length !== 1) return null;
    if (
      ['overall_goal', 'task_state'].includes(section) &&
      !matches[0][1].replace(/<!--[\s\S]*?-->/g, '').trim()
    )
      return null;
  }
  return snapshot;
}
