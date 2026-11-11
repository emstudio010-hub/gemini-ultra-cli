import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-agent-catalog-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const runs = [],
  requests = [];
let child,
  timer,
  timedOut = false;
const server = createServer((request, response) => {
  requests.push(request.url);
  response.writeHead(400);
  response.end('{}');
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
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
    GEMINI_CLI_NO_RELAUNCH: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_PROVIDERS_FILE: path.join(scratch, 'providers.json'),
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
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
  fs.writeFileSync(
    env.GEMINI_ULTRA_LOCALE_FILE,
    JSON.stringify({ locale: 'en' }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    }),
  );
  const run = async (input, expected, exit = 0) => {
    child = spawn(
      process.execPath,
      [
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
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.stderr.on('data', (value) => {
      stderr += value;
    });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 40000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    runs.push({ input, exitCode, stdout, stderr });
    assert.equal(exitCode, exit, stdout + stderr);
    assert.ok((stdout + stderr).includes(expected), stdout + stderr);
    assert.equal(requests.length, 0);
  };
  await run('/teamwork status', 'No workflow of this kind in this project.');
  const projects = fs
    .readdirSync(path.join(profile, '.gemini/tmp'), { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(projects.length, 1);
  const root = path.join(profile, '.gemini/tmp', projects[0].name);
  const workflows = path.join(root, 'agent-workflows');
  const swarms = path.join(root, 'swarms');
  fs.mkdirSync(workflows, { recursive: true });
  fs.mkdirSync(swarms, { recursive: true });
  function seed(mode, objective, saved = '2026-01-01T00:00:00.000Z') {
    const id = randomUUID();
    const file = path.join(workflows, id + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        id,
        mode,
        objective,
        brief: objective,
        phase: 'completed',
        approved: true,
        previousApprovalMode: 'default',
        milestones: [
          {
            title: objective,
            acceptance: 'Inspect saved evidence',
            completed: true,
          },
        ],
        reports: [],
        updatedAt: saved,
      }),
    );
    fs.utimesSync(file, new Date(saved), new Date(saved));
    return id;
  }
  const older = seed(
    'teamwork',
    'HISTORICAL_TEAMWORK 用户原始目标',
    '2000-01-01T00:00:00.000Z',
  );
  seed('teamwork', 'CURRENT_TEAMWORK_NEWER');
  seed('boost', 'SAVED_BOOST');
  seed('grill-me', 'SAVED_INTERVIEW');
  const swarm = randomUUID();
  const swarmDir = path.join(swarms, swarm);
  fs.mkdirSync(swarmDir);
  fs.writeFileSync(
    path.join(swarmDir, 'members.json'),
    JSON.stringify({
      id: swarm,
      objective: 'HISTORICAL_SWARM',
      phase: 'completed',
      ownerPid: process.pid,
      budgetVersion: 1,
      revision: 0,
      members: [],
      budget: {
        maxRequests: 120,
        maxFailedTurns: 2,
        maxTurns: 40,
        requests: 6,
        failedTurns: 0,
        turns: 2,
      },
    }),
  );
  fs.writeFileSync(
    path.join(swarmDir, 'owner.json'),
    JSON.stringify({ id: swarm, ownerPid: process.pid, budgetVersion: 1 }),
  );
  fs.writeFileSync(path.join(swarmDir, 'board.jsonl'), '');
  function taskHashes() {
    const files = (directory) =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((item) =>
          item.isDirectory()
            ? files(path.join(directory, item.name))
            : [path.join(directory, item.name)],
        );
    return Object.fromEntries(
      [...files(workflows), ...files(swarms)]
        .sort()
        .map((file) => [
          path.relative(root, file),
          createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        ]),
    );
  }
  const initial = taskHashes();
  await run('/teamwork status ' + older, 'HISTORICAL_TEAMWORK 用户原始目标');
  assert.ok(!runs.at(-1).stdout.includes('CURRENT_TEAMWORK_NEWER'));
  assert.deepEqual(taskHashes(), initial);
  for (let index = 0; index < 18; index++)
    seed(
      'boost',
      'PAGED_BOOST_' + index,
      new Date(1577836800000 + index * 1000).toISOString(),
    );
  const damaged = path.join(workflows, randomUUID() + '.json');
  fs.writeFileSync(damaged, '{SECRET_INVALID_RECORD');
  const oversized = path.join(workflows, randomUUID() + '.json');
  fs.writeFileSync(oversized, '');
  fs.truncateSync(oversized, 17 * 1024 * 1024);
  fs.writeFileSync(
    path.join(workflows, 'current.json'),
    '{damaged unrelated binding',
  );
  fs.writeFileSync(
    path.join(swarms, 'latest.json'),
    '{damaged unrelated binding',
  );
  const before = taskHashes();
  await run('/teamwork list', '25 total');
  const listing = runs.at(-1).stdout;
  for (const mode of ['teamwork', 'boost', 'grill-me', 'swarm'])
    assert.ok(listing.includes('[' + mode + ']'));
  assert.ok(
    listing.includes('details unavailable') &&
      !listing.includes('SECRET_INVALID_RECORD'),
  );
  await run('/boost list 2', 'page 2');
  await run('/grill-me list', 'Agent tasks in this project');
  await run('/swarm list', 'Agent tasks in this project');
  await run('/teamwork status ' + older, 'HISTORICAL_TEAMWORK 用户原始目标');
  await run('/boost status ' + older, 'Task mode does not match', 42);
  await run('/teamwork status invalid-id', 'uuid', 42);
  await run('/swarm status ' + swarm, 'HISTORICAL_SWARM');
  await run('/swarm list 0', 'Usage: /swarm list', 42);
  await run('/language 中文', '界面语言已切换为中文');
  await run('/蜂群 list', '当前项目 Agent 任务');
  assert.ok(runs.at(-1).stdout.includes('已完成'));
  await run('/团队任务 status ' + older, 'HISTORICAL_TEAMWORK 用户原始目标');
  await run('/teamwork list 99', '此页没有任务');
  await run('/swarm status ../escape', 'uuid', 42);
  assert.equal(
    fs.existsSync(path.join(workflows, older + '.budget.json')),
    false,
  );
  assert.deepEqual(taskHashes(), before);
  assert.equal(requests.length, 0);
  assert.equal(timedOut, false);
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    ),
  );
  const result = {
    passed: true,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    localRuns: runs.map((run) => ({
      input: run.input,
      exitCode: run.exitCode,
    })),
    storedTasks: 25,
    taskRecordHashesBefore: before,
    taskRecordHashesAfter: taskHashes(),
    checks: {
      allModesCatalog: true,
      pagedHistory: true,
      explicitHistoricalStatuses: true,
      missingLedgerNotInitialized: true,
      bindingsAndRecordsPreserved: true,
      modeAndIdValidation: true,
      chineseCatalogAliases: true,
      noModelRequests: true,
    },
    scope:
      'Actual CLI local catalog and explicit status on fixture-seeded saved records. Read-only record/binding hashes, pagination, invalid input and locale/aliases. No worker run, model call or autonomy claim.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      { passed: false, timedOut, requests, error: error.message },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(timer);
  fs.writeFileSync(
    output.replace(/\.json$/, '') + '-output.txt',
    runs
      .map((run) => `${run.input}\n${run.stdout}\nSTDERR\n${run.stderr}`)
      .join('\n'),
  );
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-agent-catalog-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
