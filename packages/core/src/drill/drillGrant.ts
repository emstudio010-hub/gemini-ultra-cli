/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface DrillGrantState {
  granted: boolean;
  path: string;
  at?: string | null;
  allowedNetScope?: string[];
}

function getDrillDir(): string {
  const custom = process.env['GEMINI_DRILL_DIR'];
  if (custom) return custom;
  return path.join(os.homedir(), '.gemini', 'drill');
}

export function drillGrantPath(): string {
  return path.join(getDrillDir(), 'drill-grant.json');
}

export function drillNetScopePath(): string {
  return path.join(getDrillDir(), 'net-scope-allow.txt');
}

export function readDrillGrant(): DrillGrantState {
  const file = drillGrantPath();
  const netScopeFile = drillNetScopePath();
  let allowedNetScope: string[] = ['127.0.0.1/32', 'localhost'];

  if (fs.existsSync(netScopeFile)) {
    try {
      const lines = fs
        .readFileSync(netScopeFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      if (lines.length > 0) allowedNetScope = lines;
    } catch {}
  }

  if (!fs.existsSync(file)) {
    return { granted: false, path: file, allowedNetScope };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      granted: Boolean(raw && raw.granted === true),
      path: file,
      at: raw?.at || null,
      allowedNetScope,
    };
  } catch {
    return { granted: false, path: file, allowedNetScope };
  }
}

export function writeDrillGrant(granted: boolean = true): DrillGrantState {
  const file = drillGrantPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const at = new Date().toISOString();
  fs.writeFileSync(
    file,
    JSON.stringify({ granted, at }, null, 2),
    'utf8',
  );
  return readDrillGrant();
}

export function clearDrillGrant(): boolean {
  const file = drillGrantPath();
  if (!fs.existsSync(file)) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
