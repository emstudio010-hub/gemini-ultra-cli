import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as pause } from 'node:timers/promises';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-shell-lifecycle-'),
);
process.env.GEMINI_CLI_HOME = scratch;
delete process.env.GEMINI_PTY_INFO;
let serviceModule;
if (source)
  serviceModule = path.join(
    repo,
    'packages/core/dist/src/services/shellExecutionService.js',
  );
else {
  const directory = path.dirname(entry);
  serviceModule = fs
    .readdirSync(directory)
    .filter((file) => /^chunk-.+\.js$/.test(file))
    .map((file) => path.join(directory, file))
    .find((file) =>
      /(?:var|class) ShellExecutionService\b/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
  assert.ok(serviceModule, 'Packaged shell lifecycle implementation missing');
}
const service = await import(pathToFileURL(serviceModule).href);
const { ShellExecutionService } = service;
const { NoopSandboxManager } = source
  ? await import(
      pathToFileURL(
        path.join(repo, 'packages/core/dist/src/services/sandboxManager.js'),
      ).href
    )
  : service;
const { getShellConfiguration, escapeShellArg } = source
  ? await import(
      pathToFileURL(
        path.join(repo, 'packages/core/dist/src/utils/shell-utils.js'),
      ).href
    )
  : service;
assert.equal(typeof ShellExecutionService?.execute, 'function');
const shell = getShellConfiguration().shell;
const quote = (value) => escapeShellArg(value, shell);
const fixture = path.join(scratch, 'fixture with spaces.cjs');
const ready = path.join(scratch, 'ready.json');
fs.writeFileSync(
  fixture,
  String.raw`const fs=require('node:fs');const {spawn}=require('node:child_process');const readline=require('node:readline');const mode=process.argv[2];const marker=process.argv[3];
if(mode==='interactive'){fs.writeFileSync(marker,JSON.stringify({pid:process.pid,stdinTTY:!!process.stdin.isTTY,stdoutTTY:!!process.stdout.isTTY}));process.stdout.write('PTY_READY\n');const rl=readline.createInterface({input:process.stdin});rl.once('line',line=>{process.stdout.write('PTY_INPUT_'+line+'\n');rl.close();process.exit(0);});setTimeout(()=>process.exit(90),15000);}
else if(mode==='tree'){const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),15000);setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(marker,JSON.stringify({pid:process.pid,childPid:child.pid}));process.stdout.write('TREE_READY\n');setTimeout(()=>process.exit(91),15000);setInterval(()=>{},1000);}
else if(mode==='marker'){fs.writeFileSync(marker,'UNEXPECTED_EXECUTION');process.exit(0);}
else{process.stdout.write('PIPE_OUTPUT_OK\n');}
`,
);
const command = (mode) =>
  (shell === 'powershell' ? '& ' : '') +
  [process.execPath, fixture, mode, ready].map(quote).join(' ');
const base = {
  sessionId: 'shell-lifecycle-fixture',
  terminalWidth: 100,
  terminalHeight: 30,
  disableDynamicLineTrimming: true,
  sanitizationConfig: {
    enableEnvironmentVariableRedaction: false,
    allowedEnvironmentVariables: [],
    blockedEnvironmentVariables: [],
  },
  sandboxManager: new NoopSandboxManager(),
};
const controllers = [],
  pids = new Set(),
  results = [],
  events = [];
const bounded = async (promise, ms, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(label + ' exceeded ' + ms + 'ms')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const awaitReady = async () => {
  const start = Date.now();
  while (!fs.existsSync(ready)) {
    if (Date.now() - start > 8000)
      throw new Error('Shell fixture did not start');
    await pause(50);
  }
  const value = JSON.parse(fs.readFileSync(ready, 'utf8'));
  for (const key of ['pid', 'childPid']) if (value[key]) pids.add(value[key]);
  return value;
};
const terminated = (pid) => {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return true;
    throw error;
  }
  if (process.platform !== 'win32') {
    try {
      return /^Z/.test(
        execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
          encoding: 'utf8',
        }).trim(),
      );
    } catch {
      return true;
    }
  }
  return false;
};
try {
  for (const pty of [true, false])
    for (const stage of ['before-dispatch', 'during-preparation']) {
      const controller = new globalThis.AbortController();
      controllers.push(controller);
      let cleanupCalls = 0;
      const manager = new NoopSandboxManager();
      if (stage === 'before-dispatch') controller.abort();
      else {
        const prepare = manager.prepareCommand.bind(manager);
        manager.prepareCommand = async (options) => {
          const result = await prepare(options);
          controller.abort();
          return {
            ...result,
            cleanup: () => {
              cleanupCalls++;
              result.cleanup?.();
            },
          };
        };
      }
      const handle = await bounded(
        ShellExecutionService.execute(
          command('marker'),
          scratch,
          (event) => events.push(event.type),
          controller.signal,
          pty,
          { ...base, sandboxManager: manager },
        ),
        8000,
        'Cancelled preparation',
      );
      const result = await handle.result;
      assert.equal(handle.pid, undefined);
      assert.equal(result.aborted, true);
      assert.equal(result.executionMethod, 'none');
      assert.equal(fs.existsSync(ready), false);
      assert.equal(cleanupCalls, stage === 'during-preparation' ? 1 : 0);
      results.push({
        scenario: stage,
        requestedPty: pty,
        pid: handle.pid ?? null,
        aborted: result.aborted,
        executionMethod: result.executionMethod,
        cleanupCalls,
      });
    }
  const interactive = new globalThis.AbortController();
  controllers.push(interactive);
  const handle = await ShellExecutionService.execute(
    command('interactive'),
    scratch,
    (event) => events.push(event.type),
    interactive.signal,
    true,
    base,
  );
  assert.ok(handle.pid);
  pids.add(handle.pid);
  const tty = await awaitReady();
  assert.equal(tty.stdinTTY, true);
  assert.equal(tty.stdoutTTY, true);
  ShellExecutionService.writeToPty(handle.pid, 'fixture-input\r');
  const success = await bounded(
    handle.result,
    8000,
    'Interactive PTY completion',
  );
  assert.equal(success.exitCode, 0);
  assert.equal(success.aborted, false);
  assert.equal(success.error, null);
  assert.ok(['lydell-node-pty', 'node-pty'].includes(success.executionMethod));
  assert.ok(success.output.includes('PTY_INPUT_fixture-input'));
  assert.equal(ShellExecutionService.isPtyActive(handle.pid), false);
  results.push({
    scenario: 'interactive-input',
    executionMethod: success.executionMethod,
    exitCode: success.exitCode,
    aborted: success.aborted,
    tty,
    output: success.output,
  });
  fs.rmSync(ready);
  const cancellation = new globalThis.AbortController();
  controllers.push(cancellation);
  const treeHandle = await ShellExecutionService.execute(
    command('tree'),
    scratch,
    (event) => events.push(event.type),
    cancellation.signal,
    true,
    base,
  );
  pids.add(treeHandle.pid);
  const tree = await awaitReady();
  const cancelledAt = Date.now();
  cancellation.abort(new Error('Fixture user cancellation'));
  const stopped = await bounded(
    treeHandle.result,
    8000,
    'Running PTY cancellation',
  );
  assert.equal(stopped.aborted, true);
  assert.ok(['lydell-node-pty', 'node-pty'].includes(stopped.executionMethod));
  const start = Date.now();
  while (![tree.pid, tree.childPid].every(terminated)) {
    if (Date.now() - start > 5000)
      throw new Error('Cancelled process tree still running');
    await pause(50);
  }
  assert.equal(ShellExecutionService.isPtyActive(treeHandle.pid), false);
  results.push({
    scenario: 'running-tree-cancellation',
    executionMethod: stopped.executionMethod,
    aborted: stopped.aborted,
    tree,
    cancelElapsedMs: Date.now() - cancelledAt,
    terminated: true,
  });
  const pipe = await ShellExecutionService.execute(
    command('pipe'),
    scratch,
    (event) => events.push(event.type),
    new globalThis.AbortController().signal,
    false,
    base,
  );
  const fallback = await bounded(pipe.result, 8000, 'Pipe fallback');
  assert.equal(fallback.exitCode, 0);
  assert.equal(fallback.executionMethod, 'child_process');
  assert.ok(fallback.output.includes('PIPE_OUTPUT_OK'));
  results.push({
    scenario: 'pipe-execution',
    executionMethod: fallback.executionMethod,
    exitCode: fallback.exitCode,
    output: fallback.output,
  });
  const result = {
    passed: true,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    source,
    serviceModule,
    results,
    eventCount: events.length,
    modelRequests: 0,
    scope:
      'Actual exported product shell service and native PTY: pre-start cancellation, preparation cancellation/cleanup, interactive stdin/stdout TTY, running process-tree cancellation and pipe execution. No model call, UI keystroke/resize, long-session or arbitrary external program acceptance.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      platform: result.platform,
      scenarios: results.length,
      pty: success.executionMethod,
      modelRequests: 0,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        error: String(error),
        platform: process.platform,
        results,
        serviceModule,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  for (const controller of controllers) controller.abort();
  for (const pid of pids)
    if (pid && !terminated(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* The generated fixture may have exited during cleanup. */
      }
    }
}
