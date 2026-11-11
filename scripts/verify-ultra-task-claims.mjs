import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const locale = process.argv[4] || 'en';
assert.ok(['en', 'zh'].includes(locale), 'Locale must be en or zh');
const pairs =
  locale === 'zh'
    ? [['swarm', 'swarm']]
    : [
        ['swarm', 'swarm'],
        ['teamwork', 'boost'],
        ['swarm', 'teamwork'],
      ];
const busyMessage =
  locale === 'zh'
    ? '另一个 CLI 正在更新 Agent 任务状态，请在更新完成后重试该命令。'
    : 'Another CLI is updating Agent task state';
const metadata = JSON.parse(
  fs
    .readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    )
    .replace(/^\uFEFF/, ''),
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-task-claims-'));
const requests = [],
  rounds = [],
  runs = [];
const children = new Set();
const timers = new Set();
let timedOut = false;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  requests.push({ path: req.url, bodyBytes: Buffer.concat(chunks).length });
  res.writeHead(400);
  res.end('{}');
});
const hook = path.join(scratch, 'claim-barrier.mjs');
fs.writeFileSync(
  hook,
  String.raw`
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { syncBuiltinESMExports } from 'node:module';
const targets = JSON.parse(process.env.ULTRA_TEST_CLAIM_BINDINGS || '[]');
const control = process.env.ULTRA_TEST_CLAIM_CONTROL;
const originalWrite = fs.writeFileSync;
const exists = fs.existsSync;
const pause = new Int32Array(new SharedArrayBuffer(4));
let reached = false;
fs.writeFileSync = function(file, ...args) {
  const name = typeof file === 'string' ? path.resolve(file) : '';
  if (!reached && targets.some(target => name === target || name.startsWith(target + '.'))) {
    reached = true;
    originalWrite(path.join(control, 'ready-' + process.pid), name);
    const deadline = Date.now() + 20000;
    while (!exists(path.join(control, 'go'))) {
      if (Date.now() > deadline) throw new Error('Task-claim fixture barrier timed out');
      Atomics.wait(pause, 0, 0, 10);
    }
  }
  return Reflect.apply(originalWrite, this, [file, ...args]);
};
syncBuiltinESMExports();
`,
);
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  for (const [index, modes] of pairs.entries()) {
    const folder = path.join(scratch, String(index));
    const profile = path.join(folder, 'profile');
    const workspace = path.join(folder, 'workspace');
    const control = path.join(folder, 'barrier');
    fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
    fs.mkdirSync(workspace);
    fs.mkdirSync(control);
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (
        /^(http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*|NODE_OPTIONS|ULTRA_TEST_CLAIM_.*)$/i.test(
          key,
        )
      )
        delete env[key];
    Object.assign(env, {
      HOME: profile,
      USERPROFILE: profile,
      GEMINI_CLI_HOME: profile,
      GEMINI_CLI_NO_RELAUNCH: '1',
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
      GEMINI_ULTRA_PROVIDERS_FILE: path.join(folder, 'providers.json'),
      GEMINI_ULTRA_LOCALE_FILE: path.join(folder, 'locale.json'),
      GEMINI_ULTRA_RUNTIME_FILE: path.join(folder, 'runtime.json'),
      GEMINI_ULTRA_PROMPTS_FILE: path.join(folder, 'prompts.json'),
      GEMINI_DRILL_DIR: path.join(folder, 'drill'),
      GEMINI_DRILL_DB: path.join(folder, 'facts.sqlite'),
      NO_PROXY: '*',
    });
    fs.writeFileSync(
      env.GEMINI_ULTRA_PROVIDERS_FILE,
      JSON.stringify({
        version: 1,
        activeProviderId: 'fixture',
        activeModel: 'fixture-model',
        providers: [
          {
            id: 'fixture',
            name: 'Fixture',
            baseUrl: `http://127.0.0.1:${server.address().port}`,
            apiKey: '',
            protocol: 'openai-chat',
            models: ['fixture-model'],
            defaultModel: 'fixture-model',
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    fs.writeFileSync(env.GEMINI_ULTRA_LOCALE_FILE, JSON.stringify({ locale }));
    fs.writeFileSync(
      path.join(profile, '.gemini/settings.json'),
      JSON.stringify({
        security: { auth: { selectedType: 'gateway' } },
        privacy: { usageStatisticsEnabled: false },
        general: {
          enableAutoUpdate: false,
          enableAutoUpdateNotification: false,
        },
      }),
    );
    function launch(input, gated = false) {
      const child = spawn(
        process.execPath,
        [
          ...(gated ? ['--import', pathToFileURL(hook).href] : []),
          entry,
          '-y',
          '-m',
          'fixture-model',
          '-p',
          input,
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
      const state = {
        input,
        pid: child.pid,
        exitCode: null,
        stdout: '',
        stderr: '',
      };
      children.add(child);
      child.stdout.on('data', (value) => {
        state.stdout += value;
      });
      child.stderr.on('data', (value) => {
        state.stderr += value;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 65000);
      timers.add(timer);
      const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (exitCode) => {
          clearTimeout(timer);
          timers.delete(timer);
          children.delete(child);
          state.exitCode = exitCode;
          runs.push(state);
          resolve(state);
        });
      });
      return { state, done };
    }
    const initialize = await launch('/swarm list').done;
    assert.equal(initialize.exitCode, 0, initialize.stdout + initialize.stderr);
    const projects = fs
      .readdirSync(path.join(profile, '.gemini/tmp'), { withFileTypes: true })
      .filter((item) => item.isDirectory());
    assert.equal(projects.length, 1);
    const root = path.join(profile, '.gemini/tmp', projects[0].name);
    env.ULTRA_TEST_CLAIM_BINDINGS = JSON.stringify([
      path.join(root, 'swarms/latest.json'),
      path.join(root, 'agent-workflows/current.json'),
    ]);
    env.ULTRA_TEST_CLAIM_CONTROL = control;
    const contenders = modes.map((mode, member) =>
      launch('/' + mode + ' prepare CLAIM_' + index + '_' + member, true),
    );
    const deadline = Date.now() + 60000;
    while (true) {
      const ready = fs
        .readdirSync(control)
        .filter((name) => name.startsWith('ready-'));
      if (
        ready.length === 2 ||
        (ready.length === 1 &&
          contenders.some((item) => item.state.exitCode !== null))
      )
        break;
      if (Date.now() > deadline)
        throw new Error('CLI contenders did not reach the task-claim barrier');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    fs.writeFileSync(path.join(control, 'go'), 'release');
    const outcomes = await Promise.all(contenders.map((item) => item.done));
    const files = fs
      .readdirSync(root, { recursive: true })
      .map((relative) => String(relative));
    const records = files
      .filter(
        (relative) =>
          /^agent-workflows[\\/][a-f0-9-]{36}\.json$/.test(relative) ||
          /^swarms[\\/][a-f0-9-]{36}[\\/]members\.json$/.test(relative),
      )
      .map((relative) => ({
        file: relative,
        record: JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')),
      }));
    const bindings = files
      .filter((relative) =>
        /^(swarms[\\/]latest|agent-workflows[\\/]current)\.json$/.test(
          relative,
        ),
      )
      .map((relative) => ({
        file: relative,
        value: JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')),
      }));
    const round = {
      modes,
      outcomes: outcomes.map(({ input, pid, exitCode, stdout, stderr }) => ({
        input,
        pid,
        exitCode,
        stdout,
        stderr,
      })),
      reachedBindings: fs
        .readdirSync(control)
        .filter((name) => name.startsWith('ready-')).length,
      records,
      bindings,
      transitionLockRemains: fs.existsSync(
        path.join(root, 'agent-task-transition.lock'),
      ),
    };
    rounds.push(round);
    assert.equal(
      outcomes.filter((item) => item.exitCode === 0).length,
      1,
      JSON.stringify(round),
    );
    const rejected = outcomes.filter((item) => item.exitCode === 42);
    assert.equal(rejected.length, 1, JSON.stringify(round));
    assert.ok(
      (rejected[0].stdout + rejected[0].stderr).includes(busyMessage),
      JSON.stringify(round),
    );
    assert.equal(round.reachedBindings, 1);
    assert.equal(records.length, 1, JSON.stringify(round));
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].value.id, records[0].record.id);
    assert.equal(round.transitionLockRemains, false);
    const budget =
      records[0].record.budget ||
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            'agent-workflows',
            records[0].record.id + '.budget.json',
          ),
          'utf8',
        ),
      );
    assert.equal(budget.requests, 0);
    assert.equal(requests.length, 0);
  }
  assert.equal(timedOut, false);
  const result = {
    passed: true,
    locale,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    rounds,
    checks: {
      oneWinnerPerWorkspace: true,
      zeroPartialLoserRecords: true,
      bindingsSelectWinner: true,
      zeroModelDispatches: true,
      lockReleased: true,
    },
    scope:
      locale === 'zh'
        ? 'One native Swarm/Swarm claim race in an isolated Chinese profile. Requires the exact Chinese busy message, one winner, one explicit rejection and zero model requests. English three-pair baseline is recorded separately.'
        : 'Two independent installed CLI processes per round, paused only immediately before publishing current/latest binding. Three isolated rounds: Swarm/Swarm, Teamwork/Boost, Swarm/Teamwork. Real filesystem/process exclusion, no model calls or user configuration. Does not prove arbitrary concurrent cancellation, network filesystems or old/new version coexistence.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      version: metadata.version,
      rounds: rounds.length,
      processes: runs.length,
      requests: requests.length,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        version: metadata.version,
        timedOut,
        requests,
        rounds,
        error: error.message,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  for (const timer of timers) clearTimeout(timer);
  for (const child of children) if (child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    output.replace(/\.json$/, '-output.txt'),
    runs
      .map((run) => run.input + '\n' + run.stdout + '\nSTDERR\n' + run.stderr)
      .join('\n'),
  );
}
