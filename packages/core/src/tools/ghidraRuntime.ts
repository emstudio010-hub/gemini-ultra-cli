/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import path from 'node:path';

type JavaDiscovery = { available: boolean; pathOrStatus?: string };

/** Preflight and execution must select the same JVM, including invalid overrides. */
export async function discoverGhidraJava(
  fromPath: () => JavaDiscovery | Promise<JavaDiscovery>,
): Promise<JavaDiscovery> {
  const explicit = process.env['GEMINI_ULTRA_TOOL_JAVA'];
  const javaHome = process.env['JAVA_HOME'];
  const source = explicit
    ? 'GEMINI_ULTRA_TOOL_JAVA'
    : javaHome
      ? 'JAVA_HOME'
      : 'PATH';
  const selected =
    explicit ||
    (javaHome
      ? path.join(
          javaHome,
          'bin',
          process.platform === 'win32' ? 'java.exe' : 'java',
        )
      : undefined);
  const found = selected
    ? { available: true, pathOrStatus: selected }
    : await fromPath();
  if (!found.available || !found.pathOrStatus)
    return {
      available: false,
      pathOrStatus: `No native Java found in ${source}. Configure GEMINI_ULTRA_TOOL_JAVA or JAVA_HOME, or add Java to PATH.`,
    };
  const file = path.resolve(found.pathOrStatus);
  if (/\.(cmd|bat)$/i.test(file))
    return {
      available: false,
      pathOrStatus: `${source}: ${file} is a batch wrapper; select a native Java executable.`,
    };
  try {
    if (!(await fs.promises.stat(file)).isFile()) throw new Error('not a file');
    await fs.promises.access(
      file,
      process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return { available: true, pathOrStatus: file };
  } catch {
    return {
      available: false,
      pathOrStatus: `${source}: ${file} is unavailable or not executable. Configure a native Java executable${source === 'PATH' ? '.' : ` or clear ${source} to use a lower-priority source.`}`,
    };
  }
}

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
