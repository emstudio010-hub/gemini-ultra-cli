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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-resume-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const runs = [],
  requests = [],
  preserved = [];
let expectedResumeId,
  child,
  timer,
  timedOut = false;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const text = JSON.stringify(payload.messages);
  const accepted =
    !!expectedResumeId &&
    text.includes('coordinate native swarm ' + expectedResumeId) &&
    text.includes('HISTORICAL_SWARM_OBJECTIVE') &&
    !text.includes('NEWER_SWARM_OBJECTIVE');
  requests.push({ accepted, model: payload.model, path: req.url });
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
            delta: { content: 'HISTORICAL_SWARM_RESUMED' },
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
  await run('/swarm status', 'Create a swarm', 42);
  const projects = fs
    .readdirSync(path.join(profile, '.gemini/tmp'), { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(projects.length, 1);
  const root = path.join(profile, '.gemini/tmp', projects[0].name);
  const directory = path.join(root, 'swarms');
  const bindingFile = path.join(directory, 'latest.json');
  fs.mkdirSync(directory, { recursive: true });
  const exitedOwner = spawnSync(process.execPath, ['-e', ''], {
    windowsHide: true,
  });
  assert.equal(exitedOwner.status, 0);
  assert.ok(exitedOwner.pid > 0);
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const stateFile = (id) => path.join(directory, id, 'members.json');
  const read = (id) => JSON.parse(fs.readFileSync(stateFile(id), 'utf8'));
  const bind = (id) => write(bindingFile, { id, ownerPid: exitedOwner.pid });
  const seed = (objective, phase, requests = 7) => {
    const id = randomUUID();
    const dir = path.join(directory, id);
    fs.mkdirSync(dir);
    write(path.join(dir, 'members.json'), {
      id,
      objective,
      phase,
      ownerPid: exitedOwner.pid,
      budgetVersion: 1,
      revision: 2,
      stopReason: phase === 'cancelled' ? 'Cancelled by user' : '',
      budget: {
        maxRequests: 30,
        maxFailedTurns: 2,
        maxTurns: 12,
        requests,
        failedTurns: 1,
        turns: 3,
      },
      roleModels: { coder: 'native:gemini-fixture' },
      memberModels: {},
      worktreeRequired: false,
      members: [
        {
          name: 'reader',
          agent: 'researcher',
          brief: 'Retain evidence',
          state: 'paused',
          turns: 1,
          lastRead: 1,
          result: 'RETAINED_READER_RESULT',
          modelsUsed: ['fixture:fixture-model'],
        },
        {
          name: 'retired',
          agent: 'coder',
          brief: 'Retired member',
          state: 'killed',
          turns: 2,
          lastRead: 1,
          result: 'RETAINED_RETIRED_RESULT',
          modelsUsed: [],
        },
      ],
    });
    write(path.join(dir, 'owner.json'), {
      id,
      ownerPid: exitedOwner.pid,
      budgetVersion: 1,
      accountingUnknown: false,
    });
    fs.writeFileSync(
      path.join(dir, 'board.jsonl'),
      JSON.stringify({
        seq: 1,
        sender: 'coordinator',
        text: objective,
        time: '2026-01-01T00:00:00.000Z',
      }) + '\n',
    );
    return id;
  };
  const hashes = () =>
    Object.fromEntries(
      fs
        .readdirSync(root, { recursive: true })
        .sort()
        .flatMap((relative) => {
          const file = path.join(root, relative);
          return fs.statSync(file).isFile() &&
            /^(swarms|agent-workflows)[\\/]/.test(relative)
            ? [
                [
                  relative,
                  createHash('sha256')
                    .update(fs.readFileSync(file))
                    .digest('hex'),
                ],
              ]
            : [];
        }),
    );
  const unchanged = async (name, input, expected, exit = 0) => {
    const before = hashes();
    await run(input, expected, exit);
    const after = hashes();
    assert.deepEqual(after, before);
    preserved.push({ name, files: Object.keys(before).length, before, after });
  };
  const complete = seed('COMPLETED_HISTORICAL_SWARM', 'completed');
  const older = seed('HISTORICAL_SWARM_OBJECTIVE', 'cancelled');
  const newer = seed('NEWER_SWARM_OBJECTIVE', 'completed');
  const depleted = seed('DEPLETED_HISTORICAL_SWARM', 'cancelled', 30);
  bind(newer);
  await unchanged(
    'explicit completed ID',
    '/swarm resume ' + complete,
    complete,
  );
  await unchanged('current completed without ID', '/swarm resume', newer);
  await unchanged('bad ID', '/swarm resume invalid-id', 'uuid', 42);
  await unchanged('missing ID', '/swarm resume ' + randomUUID(), 'ENOENT', 42);
  await run('/language 中文', '界面语言已切换为中文');
  await unchanged(
    'Chinese alias completed',
    '/蜂群 resume ' + complete,
    '不会重复执行',
  );
  await run('/language English', 'Interface language switched to English');
  fs.writeFileSync(bindingFile, '{damaged binding');
  await unchanged(
    'completed bypasses damaged binding',
    '/swarm resume ' + complete,
    complete,
  );
  await unchanged(
    'active resume refuses damaged binding',
    '/swarm resume ' + older,
    'Swarm state is damaged',
    42,
  );
  bind(newer);
  const newerState = read(newer);
  for (const phase of ['active', 'blocked']) {
    write(stateFile(newer), { ...newerState, phase });
    await unchanged(
      'another ' + phase + ' swarm',
      '/swarm resume ' + older,
      'other pending swarm',
      42,
    );
  }
  write(stateFile(newer), newerState);
  const workflowDirectory = path.join(root, 'agent-workflows');
  fs.mkdirSync(workflowDirectory);
  const workflowId = randomUUID();
  const workflowLedger = path.join(
    workflowDirectory,
    workflowId + '.budget.json',
  );
  const workflowBinding = path.join(workflowDirectory, 'current.json');
  write(workflowLedger, {
    id: workflowId,
    mode: 'teamwork',
    ownerPid: exitedOwner.pid,
    state: 'active',
    maxRequests: 30,
    maxFailedStages: 2,
    maxImplementationRounds: 1,
    requests: 4,
    failedStages: 0,
    implementationRounds: [],
  });
  write(workflowBinding, { id: workflowId, ownerPid: exitedOwner.pid });
  await unchanged(
    'pending workflow budget',
    '/swarm resume ' + older,
    'pending workflow',
    42,
  );
  fs.unlinkSync(workflowBinding);
  fs.unlinkSync(workflowLedger);
  await unchanged(
    'exhausted budget leaves owner intact',
    '/swarm resume ' + depleted,
    'still exhausted',
    42,
  );
  const original = read(older);
  write(stateFile(older), { ...original, ownerPid: process.pid });
  await unchanged(
    'live owner refused',
    '/swarm resume ' + older,
    'owning CLI session',
    42,
  );
  write(stateFile(older), original);
  const before = hashes();
  expectedResumeId = older;
  await run('/swarm resume ' + older, 'HISTORICAL_SWARM_RESUMED', 0, 1);
  const resumed = read(older);
  const binding = JSON.parse(fs.readFileSync(bindingFile, 'utf8'));
  assert.equal(binding.id, older);
  assert.equal(resumed.phase, 'active');
  assert.deepEqual(resumed.budget, { ...original.budget, requests: 8 });
  assert.deepEqual(resumed.members, original.members);
  assert.deepEqual(resumed.roleModels, original.roleModels);
  const after = hashes();
  for (const [file, hash] of Object.entries(before))
    if (!file.includes(older) && file !== path.relative(root, bindingFile))
      assert.equal(after[file], hash, file);
  const board = fs
    .readFileSync(path.join(directory, older, 'board.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(board.length, 2);
  assert.equal(board[0].text, original.objective);
  assert.ok(board[1].text.includes('Explicitly resumed'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].accepted, true);
  assert.equal(timedOut, false);
  const metadata = JSON.parse(
    fs
      .readFileSync(
        path.join(path.dirname(path.dirname(entry)), 'package.json'),
        'utf8',
      )
      .replace(/^\uFEFF/, ''),
  );
  const result = {
    passed: true,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    localRuns: runs.map(({ input, exitCode }) => ({ input, exitCode })),
    preserved,
    resumed: {
      id: older,
      phase: resumed.phase,
      bindingId: binding.id,
      budget: resumed.budget,
      members: resumed.members,
      board,
    },
    nonselectedHashesBefore: Object.fromEntries(
      Object.entries(before).filter(
        ([file]) =>
          !file.includes(older) && file !== path.relative(root, bindingFile),
      ),
    ),
    nonselectedHashesAfter: Object.fromEntries(
      Object.entries(after).filter(
        ([file]) =>
          !file.includes(older) && file !== path.relative(root, bindingFile),
      ),
    ),
    checks: {
      explicitIdSelected: true,
      completedLocal: true,
      chineseAlias: true,
      refusalsPreserveFiles: true,
      pendingTasksProtected: true,
      ownershipProtected: true,
      spentUsageRetained: true,
      membersAndBoardRetained: true,
      exactlyOneCoordinatorRequest: true,
    },
    scope:
      'Installed native Swarm command with host-seeded historical states and one loopback coordinator response. Proves selection, binding, accounting and local refusal/terminal paths; not a new real multi-agent delivery or paid retry.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      version: result.version,
      commands: runs.length,
      requests: requests.length,
      preservedCases: preserved.length,
    }),
  );
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
  if (child && child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    output.replace(/\.json$/, '-output.txt'),
    runs
      .map((run) => run.input + '\n' + run.stdout + '\nSTDERR\n' + run.stderr)
      .join('\n'),
  );
}
