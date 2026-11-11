import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRequire = createRequire(
  path.resolve(path.dirname(entry), '../package.json'),
);
const developmentRequire = createRequire(path.join(repo, 'package.json'));
const pty = packageRequire('@lydell/node-pty');
const { Terminal } = developmentRequire('@xterm/headless');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-provider-credential-'),
);
const profile = path.join(root, 'profile');
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const requests = [];
const server = createServer(async (request, response) => {
  for await (const part of request) void part;
  requests.push({ method: request.method, url: request.url });
  response.writeHead(400);
  response.end('{}');
});
const fakeKey = 'FAKE_PROVIDER_KEY_DO_NOT_USE';
let terminal,
  exited = false,
  exitResult,
  timedOut = false,
  raw = '';
const emulator = new Terminal({
  cols: 140,
  rows: 40,
  scrollback: 0,
  allowProposedApi: true,
});
const watchers = new Set();
const visible = () =>
  Array.from(
    { length: emulator.buffer.active.length },
    (_, line) =>
      emulator.buffer.active.getLine(line)?.translateToString(true) || '',
  ).join('\n');
const waitFor = async (predicate, label, ms = 20000) => {
  if (predicate()) return;
  await new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        clearTimeout(timer);
        watchers.delete(check);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      watchers.delete(check);
      timedOut = true;
      reject(new Error('Timed out: ' + label));
    }, ms);
    watchers.add(check);
  });
};
const send = async (command, expected) => {
  await pause(250);
  const offset = raw.length;
  terminal.write(command);
  await pause(180);
  terminal.write('\r');
  await waitFor(() => raw.slice(offset).includes(expected), expected);
  await pause(250);
};
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const providers = path.join(root, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'seed',
      activeModel: 'credential-fixture',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'seed',
          name: 'Seed',
          baseUrl: endpoint,
          protocol: 'openai-chat',
          apiKey: 'fixture-only',
          models: ['credential-fixture'],
          defaultModel: 'credential-fixture',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
      ui: { useAlternateBuffer: false },
    }),
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*|NODE_OPTIONS)$/i.test(
        key,
      )
    )
      delete env[key];
  Object.assign(env, {
    HOME: profile,
    USERPROFILE: profile,
    GEMINI_CLI_HOME: profile,
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_PROVIDERS_FILE: providers,
    GEMINI_ULTRA_LOCALE_FILE: path.join(root, 'locale.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(root, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(root, 'prompts.json'),
    GEMINI_ULTRA_TOOLS_FILE: path.join(root, 'tools.json'),
    GEMINI_DRILL_DIR: path.join(root, 'drill'),
    GEMINI_DRILL_DB: path.join(root, 'facts.sqlite'),
    NO_PROXY: '*',
    TERM: 'xterm-256color',
  });
  fs.writeFileSync(
    env.GEMINI_ULTRA_LOCALE_FILE,
    JSON.stringify({ locale: 'en' }),
  );
  fs.writeFileSync(
    env.GEMINI_ULTRA_RUNTIME_FILE,
    JSON.stringify({
      collaboration: 'single',
      maxParallel: 1,
      workflow: 'general',
    }),
  );
  fs.writeFileSync(
    env.GEMINI_ULTRA_PROMPTS_FILE,
    JSON.stringify({ enabled: false, prompt: '', rules: [] }),
  );
  terminal = pty.spawn(
    process.execPath,
    [entry, '-m', 'seed:credential-fixture'],
    {
      name: 'xterm-256color',
      cols: 140,
      rows: 40,
      cwd: workspace,
      env,
      ...(process.platform === 'win32' ? { useConpty: true } : {}),
    },
  );
  terminal.onData((data) => {
    raw += data;
    if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R');
    emulator.write(data, () => {
      for (const check of watchers) check();
    });
  });
  terminal.onExit((result) => {
    exited = true;
    exitResult = result;
    for (const check of watchers) check();
  });
  await waitFor(() => visible().includes('Type your message'), 'input ready');
  await send('/provider list', 'Configured providers');
  await send(
    `/provider add Added ${endpoint} ${fakeKey} credential-fixture`,
    'Saved and switched to Added',
  );
  await waitFor(
    () => visible().includes('/provider add ***'),
    'redacted submitted command',
  );
  const submittedScreen = visible();
  assert.ok(
    !submittedScreen.includes(fakeKey),
    'Submitted viewport still displays fake credentials',
  );
  const configuration = JSON.parse(fs.readFileSync(providers, 'utf8'));
  assert.equal(
    configuration.providers.find((provider) => provider.name === 'Added')
      ?.apiKey,
    fakeKey,
  );
  const beforeReplay = (visible().match(/\/provider list/g) || []).length;
  terminal.write('\x1b[A');
  await waitFor(
    () =>
      visible().includes(fakeKey) ||
      (visible().match(/\/provider list/g) || []).length > beforeReplay,
    'ordinary command restored by Up',
  );
  const replayScreen = visible();
  assert.ok(!replayScreen.includes(fakeKey));
  assert.ok(
    (replayScreen.match(/\/provider list/g) || []).length > beforeReplay,
  );
  terminal.write('\x05');
  await pause(100);
  terminal.write('\x15');
  await pause(200);
  terminal.write('/quit');
  await pause(180);
  terminal.write('\r');
  await waitFor(() => exited, 'natural exit', 10000);
  assert.equal(exitResult.exitCode, 0);
  assert.equal(requests.length, 0);
  const headless = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        entry,
        '-p',
        `/Provider add Added ${endpoint} ${fakeKey} credential-fixture`,
        '--output-format',
        'json',
      ],
      {
        cwd: workspace,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error('Headless credential command did not finish'));
    }, 30000);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
  assert.equal(headless.code, 42);
  assert.ok(
    (headless.stdout + headless.stderr).includes(
      'Provider configuration command is unavailable',
    ),
  );
  assert.ok(!(headless.stdout + headless.stderr).includes(fakeKey));
  assert.equal(requests.length, 0);
  const result = {
    passed: true,
    entry,
    platform: process.platform,
    timedOut,
    exitCode: exitResult.exitCode,
    headlessExitCode: headless.code,
    modelRequests: requests.length,
    credentialPreservedInConfig: true,
    submittedHistoryRedacted: true,
    replayRestoredOrdinaryCommand: true,
    unknownCredentialCommandStayedLocal: true,
    submittedScreen,
    replayScreen,
    scope:
      'Actual native CLI with isolated fake configuration. Checks submitted viewport and replay history, then headless typo handling. Raw PTY bytes include the editable fake key before submission and are not claimed redacted. Trace metadata is covered separately by the targeted hook regression.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      ...result,
      submittedScreen: undefined,
      replayScreen: undefined,
    }),
  );
} catch (error) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        entry,
        timedOut,
        exitResult,
        requests,
        error: error.message,
        visible: visible(),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  fs.writeFileSync(output.replace(/\.json$/, '') + '-raw-pty.txt', raw);
  if (!exited && terminal) {
    terminal.kill();
    for (let attempt = 0; attempt < 30 && !exited; attempt++) await pause(100);
  }
  emulator.dispose();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-provider-credential-/);
  fs.rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
process.stdout.write('', () => process.exit(process.exitCode || 0));
