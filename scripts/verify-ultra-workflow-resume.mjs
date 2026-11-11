import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-workflow-resume-'),
);
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const runs = [],
  requests = [];
let expectedResumeId;
let child,
  timer,
  timedOut = false;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const text = JSON.stringify(payload.messages);
  const accepted =
    !!expectedResumeId &&
    text.includes(expectedResumeId) &&
    text.includes('HISTORICAL_DRAFT_OBJECTIVE') &&
    !text.includes('NEWER_COMPLETED_OBJECTIVE');
  requests.push({ accepted, path: req.url, model: payload.model });
  if (!accepted) {
    res.writeHead(400);
    res.end('{}');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    'data: ' +
      JSON.stringify({
        choices: [
          {
            delta: { content: 'HISTORICAL_RESUME_SCOPING' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 10,
          total_tokens: 1010,
        },
      }) +
      '\n\ndata: [DONE]\n\n',
  );
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
  const run = async (input, expected, exit = 0, expectedRequests = 0) => {
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
    assert.equal(requests.length, expectedRequests);
  };
  await run('/teamwork status', 'No workflow of this kind in this project.');
  const projects = fs
    .readdirSync(path.join(profile, '.gemini/tmp'), { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(projects.length, 1);
  const root = path.join(profile, '.gemini/tmp', projects[0].name);
  const directory = path.join(root, 'agent-workflows');
  fs.mkdirSync(directory, { recursive: true });
  const exitedOwner = spawnSync(process.execPath, ['-e', ''], {
    windowsHide: true,
  });
  assert.equal(exitedOwner.status, 0);
  assert.ok(exitedOwner.pid > 0);
  const seed = (
    mode,
    objective,
    updatedAt,
    phase = 'completed',
    approved = true,
  ) => {
    const id = randomUUID();
    const file = path.join(directory, id + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        id,
        mode,
        objective,
        brief: objective,
        phase,
        approved,
        previousApprovalMode: 'default',
        updatedAt,
        milestones: [
          {
            title: objective,
            acceptance: 'Retain original evidence',
            completed: phase === 'completed',
          },
        ],
        reports: [],
        budgetVersion: 1,
        budgetOwnerPid: exitedOwner.pid,
      }),
    );
    fs.writeFileSync(
      path.join(directory, id + '.budget.json'),
      JSON.stringify({
        id,
        mode,
        ownerPid: exitedOwner.pid,
        state: 'closed',
        maxRequests: 30,
        maxFailedStages: 2,
        maxImplementationRounds: 1,
        requests: 7,
        failedStages: 0,
        implementationRounds: [1],
      }),
    );
    return id;
  };
  const ids = Object.fromEntries(
    ['boost', 'teamwork', 'grill-me'].map((mode) => [
      mode,
      seed(mode, 'COMPLETE_' + mode, '2026-01-02T00:00:00.000Z'),
    ]),
  );
  fs.writeFileSync(
    path.join(directory, 'current.json'),
    JSON.stringify({ id: ids['teamwork'], ownerPid: exitedOwner.pid }),
  );
  const hashes = () =>
    Object.fromEntries(
      fs
        .readdirSync(directory)
        .sort()
        .map((file) => [
          file,
          createHash('sha256')
            .update(fs.readFileSync(path.join(directory, file)))
            .digest('hex'),
        ]),
    );
  const before = hashes();
  for (const mode of ['boost', 'teamwork', 'grill-me']) {
    await run('/' + mode + ' resume ' + ids[mode], ids[mode]);
    await run('/' + mode + ' resume', ids[mode]);
  }
  await run('/boost resume ' + ids['teamwork'], 'Task mode does not match', 42);
  await run('/teamwork resume invalid-id', 'uuid', 42);
  await run('/teamwork resume ' + randomUUID(), 'ENOENT', 42);
  await run('/language 中文', '界面语言已切换为中文');
  await run('/团队任务 resume ' + ids['teamwork'], '已完成');
  assert.deepEqual(hashes(), before);
  const closedHashes = hashes();
  await run('/language English', 'Interface language switched to English');
  expectedResumeId = seed(
    'teamwork',
    'HISTORICAL_DRAFT_OBJECTIVE',
    '2000-01-01T00:00:00.000Z',
    'cancelled',
    false,
  );
  const ledgerFile = path.join(directory, expectedResumeId + '.budget.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  ledger.implementationRounds = [];
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
  seed('teamwork', 'NEWER_COMPLETED_OBJECTIVE', '2026-01-03T00:00:00.000Z');
  await run(
    '/teamwork resume ' + expectedResumeId,
    'HISTORICAL_RESUME_SCOPING',
    0,
    1,
  );
  const resumed = JSON.parse(
    fs.readFileSync(path.join(directory, expectedResumeId + '.json'), 'utf8'),
  );
  assert.equal(resumed.id, expectedResumeId);
  assert.equal(resumed.phase, 'scoping');
  assert.equal(resumed.approved, false);
  const afterLedger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(afterLedger.requests, 8);
  assert.equal(afterLedger.maxRequests, 30);
  assert.equal(afterLedger.failedStages, 0);
  assert.deepEqual(afterLedger.implementationRounds, []);
  const binding = JSON.parse(
    fs.readFileSync(path.join(directory, 'current.json'), 'utf8'),
  );
  assert.equal(binding.id, expectedResumeId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].accepted, true);
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
    completedTaskHashesBefore: before,
    completedTaskHashesAfter: closedHashes,
    resumed: {
      id: resumed.id,
      phase: resumed.phase,
      approved: resumed.approved,
      budget: afterLedger,
      bindingId: binding.id,
    },
    checks: {
      completedResumeLocal: true,
      completedStateAndBudgetUnchanged: true,
      explicitDraftSelected: true,
      scopingNotApproved: true,
      cumulativeBudgetRetained: true,
      invalidIdAndModeNoFallback: true,
      chineseMessageAndAlias: true,
      exactlyOneScopingRequest: true,
    },
    scope:
      'Actual CLI completed resume with/without ID in three workflow modes and explicit historical draft selection with loopback model. Closed task hashes unchanged; unapproved draft remains scoping and cumulative usage retained. No real paid task retry.',
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
  assert.match(path.basename(scratch), /^ultra-workflow-resume-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
