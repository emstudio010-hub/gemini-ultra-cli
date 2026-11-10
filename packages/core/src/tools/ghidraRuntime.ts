/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';

/** Official releases omit some platform natives; Java/Utility.jar alone is insufficient. */
export function discoverGhidraDecompiler(home: string): {
  available: boolean;
  pathOrStatus: string;
} {
  const cpu = process.arch === 'arm64' ? 'arm_64' : 'x86_64';
  const platform = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}_${cpu}`;
  const platforms =
    process.platform === 'win32' && process.arch === 'arm64'
      ? [platform, 'win_x86_64']
      : [platform];
  for (const target of platforms) {
    for (const directory of ['build/os', 'os']) {
      const file = path.join(
        home,
        'Ghidra/Features/Decompiler',
        directory,
        target,
        process.platform === 'win32' ? 'decompile.exe' : 'decompile',
      );
      try {
        if (!fs.statSync(file).isFile()) continue;
        fs.accessSync(
          file,
          process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
        );
        return { available: true, pathOrStatus: file };
      } catch {
        /* Try the alternate build/prebuilt location. */
      }
    }
  }
  return {
    available: false,
    pathOrStatus: `Missing executable Ghidra decompiler for ${platform}. Official archives omit macOS and Linux ARM natives. Follow Ghidra GettingStarted.md, Building Native Components: from the installation's support/gradle directory run ./gradlew :Decompiler:buildNatives (gradlew.bat on Windows) with the required JDK and C/C++ toolchain.`,
  };
}
