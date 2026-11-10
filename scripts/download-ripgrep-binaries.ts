/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Maintainer-only recovery of pinned assets. Packaging and installation do not
// download a native executable at runtime.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = fileURLToPath(
  new URL('../packages/core/vendor/ripgrep/', import.meta.url),
);
const manifest = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    binaries: z.array(
      z.object({
        file: z.string().regex(/^rg-(darwin|linux|win32)-(arm64|x64)(\.exe)?$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
        source: z.string().url(),
        member: z.string().regex(/^ripgrep-[a-zA-Z0-9._-]+\/rg(\.exe)?$/),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')));
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const scratch = await mkdtemp(
  path.join(os.tmpdir(), 'ultra-ripgrep-download-'),
);
const licenses = ['COPYING', 'LICENSE-MIT', 'UNLICENSE'];

function extract(archive: string, member: string): Buffer {
  const isPosixZip = archive.endsWith('.zip') && process.platform !== 'win32';
  return execFileSync(
    isPosixZip ? 'unzip' : 'tar',
    isPosixZip ? ['-p', archive, member] : ['-xOf', archive, member],
    { maxBuffer: 16 * 1024 * 1024 },
  );
}

try {
  await mkdir(root, { recursive: true });
  let missingLicense = false;
  for (const file of licenses) {
    try {
      await readFile(path.join(root, file));
    } catch {
      missingLicense = true;
    }
  }
  for (const binary of manifest.binaries) {
    const prefix = `https://github.com/BurntSushi/ripgrep/releases/download/${manifest.version}/`;
    if (!binary.source.startsWith(prefix))
      throw new Error('Unexpected ripgrep source');
    const destination = path.join(root, binary.file);
    let cached = false;
    try {
      cached = hash(await readFile(destination)) === binary.sha256;
    } catch {
      /* Download missing assets. */
    }
    if (cached && !missingLicense) {
      if (process.platform !== 'win32') await chmod(destination, 0o755);
      console.log(`[Verified cache] ${binary.file}`);
      continue;
    }
    const response = await fetch(binary.source, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`Ripgrep download failed: HTTP ${response.status}`);
    const archiveBytes = new Uint8Array(await response.arrayBuffer());
    if (hash(archiveBytes) !== binary.archiveSha256)
      throw new Error('Ripgrep archive checksum mismatch');
    const archive = path.join(
      scratch,
      path.basename(new URL(binary.source).pathname),
    );
    await writeFile(archive, archiveBytes);
    const bytes = extract(archive, binary.member);
    if (hash(bytes) !== binary.sha256)
      throw new Error(`Ripgrep binary checksum mismatch: ${binary.file}`);
    await writeFile(destination, bytes);
    if (process.platform !== 'win32') await chmod(destination, 0o755);
    if (missingLicense) {
      for (const file of licenses)
        await writeFile(
          path.join(root, file),
          extract(archive, binary.member.replace(/rg(\.exe)?$/, file)),
        );
      missingLicense = false;
    }
    console.log(`[Verified download] ${binary.file}`);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
