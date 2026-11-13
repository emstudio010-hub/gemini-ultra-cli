/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const reviewFilesSchema = z
  .array(z.string().trim().min(1).max(1024))
  .max(64);
export const reviewedFilesSchema = z.object({
  directory: z.string().min(1),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .max(64),
});
export type ReviewedFiles = z.infer<typeof reviewedFilesSchema>;
const limit = 64 * 1024 * 1024;
const inside = (directory: string, file: string) => {
  const relative = path.relative(directory, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
};

/** Hash only the declared review artifacts; never scan unrelated workspace files. */
export function captureReviewFiles(
  directory: string,
  names: string[],
): ReviewedFiles {
  const workspace = fs.realpathSync.native(directory);
  const paths = reviewFilesSchema.parse(names);
  const seen = new Set<string>();
  let total = 0;
  const files = paths.map((name) => {
    const file = path.resolve(workspace, name);
    if (!inside(workspace, file))
      throw new Error('Review files must be inside the task workspace.');
    const relative = path.relative(workspace, file).split(path.sep).join('/');
    const key =
      process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (seen.has(key))
      throw new Error('Review files must not contain duplicate paths.');
    seen.add(key);
    const before = fs.lstatSync(file);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      !inside(workspace, fs.realpathSync.native(file))
    )
      throw new Error(
        'Review artifacts must be regular files inside the task workspace.',
      );
    if (total + before.size > limit)
      throw new Error(
        'Declared review files exceed the 64 MiB snapshot limit; narrow the review file list.',
      );
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      const opened = fs.fstatSync(fd);
      if (
        !opened.isFile() ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino
      )
        throw new Error(
          'A review file changed while its snapshot was being read.',
        );
      const buffer = Buffer.allocUnsafe(65536);
      for (;;) {
        const count = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!count) break;
        bytes += count;
        if (total + bytes > limit)
          throw new Error(
            'Declared review files exceed the 64 MiB snapshot limit; narrow the review file list.',
          );
        hash.update(buffer.subarray(0, count));
      }
      const after = fs.fstatSync(fd);
      const current = fs.lstatSync(file);
      if (
        bytes !== opened.size ||
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs ||
        after.ctimeMs !== opened.ctimeMs ||
        current.isSymbolicLink() ||
        current.dev !== after.dev ||
        current.ino !== after.ino ||
        !inside(workspace, fs.realpathSync.native(file))
      )
        throw new Error(
          'A review file changed while its snapshot was being read.',
        );
    } finally {
      fs.closeSync(fd);
    }
    total += bytes;
    return { path: relative, sha256: hash.digest('hex'), bytes };
  });
  files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return reviewedFilesSchema.parse({ directory: workspace, files });
}

export function reviewFilesUnchanged(
  directory: string,
  snapshot: ReviewedFiles,
): boolean {
  try {
    return (
      JSON.stringify(
        captureReviewFiles(
          directory,
          snapshot.files.map((file) => file.path),
        ),
      ) === JSON.stringify(snapshot)
    );
  } catch {
    return false;
  }
}
