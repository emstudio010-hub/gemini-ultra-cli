#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import {
  RELAUNCH_EXIT_CODE,
  getSpawnConfig,
  getScriptArgs,
  setupSignalForwarding,
  handleChildProcessClose,
} from './src/utils/processUtils.js';

// --- Global Entry Point ---

async function getMemoryNodeArgs(): Promise<string[]> {
  let autoConfigureMemory = true;
  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Respect GEMINI_CLI_HOME environment variable, falling back to os.homedir()
    const baseDir = join(
      process.env['GEMINI_CLI_HOME'] || os.homedir(),
      '.gemini',
    );
    const settingsPath = join(baseDir, 'settings.json');
    const rawSettings = readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(rawSettings);
    if (settings?.advanced?.autoConfigureMemory === false) {
      autoConfigureMemory = false;
    }
  } catch {
    // ignore
  }

  if (autoConfigureMemory) {
    const totalMemoryMB = os.totalmem() / (1024 * 1024);
    const heapStats = v8.getHeapStatistics();
    const currentMaxOldSpaceSizeMb = Math.floor(
      heapStats.heap_size_limit / 1024 / 1024,
    );
    const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);

    if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
      return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
    }
  }

  return [];
}

async function run() {
  process.env['GEMINI_ULTRA_CLI'] = '1';
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 19)) {
    process.stderr.write(
      `Gemini Ultra CLI requires Node.js 22.19 or newer (current: ${process.versions.node}). Update Node.js and restart your terminal.\n`,
    );
    process.exitCode = 1;
    return;
  }
  // Version lookup must not initialize providers, tools, authentication or a child process.
  if (
    process.argv.length === 3 &&
    ['--version', '-v'].includes(process.argv[2])
  ) {
    const version =
      process.env['CLI_VERSION'] ||
      (
        JSON.parse(
          readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
        ) as { version: string }
      ).version;
    process.stdout.write(`${version}\n`);
    return;
  }
  // Compile caching is optional on supported Node releases.
  if (
    'enableCompileCache' in nodeModule &&
    typeof nodeModule.enableCompileCache === 'function'
  ) {
    nodeModule.enableCompileCache();
  }
  if (!process.env['GEMINI_CLI_NO_RELAUNCH'] && !process.env['SANDBOX']) {
    // --- Lightweight Parent Process / Daemon ---
    // We avoid importing heavy dependencies here to save ~1.5s of startup time.

    const scriptArgs = getScriptArgs();
    const memoryArgs = await getMemoryNodeArgs();
    const { spawnArgs, env: newEnv } = getSpawnConfig(memoryArgs, scriptArgs);

    let latestAdminSettings: unknown = undefined;

    const runner = () => {
      process.stdin.pause();

      const child = spawn(process.execPath, spawnArgs, {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: newEnv,
      });

      // Clear one-time auth override from supervisor environment after passing to child
      delete process.env['GEMINI_CLI_AUTH_OVERRIDE'];
      delete newEnv['GEMINI_CLI_AUTH_OVERRIDE'];

      if (latestAdminSettings) {
        child.send({ type: 'admin-settings', settings: latestAdminSettings });
      }

      child.on(
        'message',
        (msg: { type?: string; settings?: unknown; authType?: string }) => {
          if (msg.type === 'admin-settings-update' && msg.settings) {
            latestAdminSettings = msg.settings;
          }
          if (msg.type === 'auth-selected-type' && msg.authType) {
            process.env['GEMINI_CLI_AUTH_OVERRIDE'] = msg.authType;
            newEnv['GEMINI_CLI_AUTH_OVERRIDE'] = msg.authType;
          }
        },
      );

      const removeForwarders = setupSignalForwarding(child);

      return new Promise<number>((resolve) => {
        child.on('error', (err) => {
          removeForwarders();
          process.stderr.write(
            'Error: Failed to start child process: ' + err.message + '\n',
          );
          resolve(1);
        });
        child.on('close', (code, signal) => {
          handleChildProcessClose(code, signal, removeForwarders, resolve);
        });
      });
    };

    while (true) {
      try {
        const exitCode = await runner();
        if (process.platform === 'android' || exitCode !== RELAUNCH_EXIT_CODE) {
          process.exit(exitCode);
        }
      } catch (error: unknown) {
        process.stdin.resume();
        process.stderr.write(
          `Fatal error: Failed to relaunch the CLI process.\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        process.exit(1);
      }
    }
  } else {
    // --- Heavy Child Process ---
    // Now we can safely import everything.
    const { main } = await import('./src/gemini.js');
    const { FatalError, writeToStderr } = await import(
      '@google/gemini-cli-core'
    );
    const { runExitCleanup } = await import('./src/utils/cleanup.js');
    const { formatCliError, isCliDebugEnabled } = await import(
      './src/utils/formatError.js'
    );

    main().catch(async (error: unknown) => {
      // Set a timeout to force exit if cleanup hangs
      const cleanupTimeout = setTimeout(() => {
        writeToStderr('Cleanup timed out, forcing exit...\n');
        process.exit(1);
      }, 5000);

      try {
        await runExitCleanup();
      } catch (cleanupError: unknown) {
        writeToStderr(
          `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
        );
      } finally {
        clearTimeout(cleanupTimeout);
      }

      if (error instanceof FatalError) {
        let errorMessage = error.message;
        if (!process.env['NO_COLOR']) {
          errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
        }
        writeToStderr(errorMessage + '\n');
        process.exit(error.exitCode);
      }

      writeToStderr(
        formatCliError(error, {
          debug: isCliDebugEnabled(),
          prefix: 'An unexpected critical error occurred: ',
        }) + '\n',
      );
      process.exit(1);
    });
  }
}

run();
