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
const metadata = JSON.parse(
  fs
    .readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    )
    .replace(/^\uFEFF/, ''),
);
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-workflow-exclusion-'),
);
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
    text.includes(expectedResumeId) &&
    text.includes('HISTORICAL_DRAFT_OBJECTIVE');
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
            delta: { content: 'EXPLICIT_DRAFT_AFTER_SWARM' },
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
      general: {
        enableAutoUpdate: false,
        enableAutoUpdateNotification: false,
        maxAttempts: 1,
      },
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
  const workflows = path.join(root, 'agent-workflows');
  const swarmId = randomUUID();
  const swarmDir = path.join(root, 'swarms', swarmId);
  fs.mkdirSync(workflows);
  fs.mkdirSync(swarmDir, { recursive: true });
  const exitedOwner = spawnSync(process.execPath, ['-e', ''], {
    windowsHide: true,
  });
  assert.equal(exitedOwner.status, 0);
  assert.ok(exitedOwner.pid > 0);
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const workflowFile = (id) => path.join(workflows, id + '.json');
  const seed = (mode, objective) => {
    const id = randomUUID();
    write(workflowFile(id), {
      id,
      mode,
      objective,
      brief: objective,
      phase: 'cancelled',
      approved: mode === 'boost',
      previousApprovalMode: 'default',
      updatedAt: '2026-01-01T00:00:00.000Z',
      milestones: [
        {
          title: objective,
          acceptance: 'Preserve original task',
          completed: false,
        },
      ],
      reports: [],
      budgetVersion: 1,
      budgetOwnerPid: exitedOwner.pid,
    });
    write(path.join(workflows, id + '.budget.json'), {
      id,
      mode,
      ownerPid: exitedOwner.pid,
      state: 'closed',
      maxRequests: 30,
      maxFailedStages: 2,
      maxImplementationRounds: 1,
      requests: 7,
      failedStages: 0,
      implementationRounds: [],
    });
    return id;
  };
  const boost = seed('boost', 'HISTORICAL_BOOST_OBJECTIVE');
  const teamwork = seed('teamwork', 'HISTORICAL_DRAFT_OBJECTIVE');
  write(path.join(workflows, 'current.json'), {
    id: boost,
    ownerPid: exitedOwner.pid,
  });
  const swarm = {
    id: swarmId,
    objective: 'PENDING_SWARM_OBJECTIVE',
    phase: 'active',
    ownerPid: exitedOwner.pid,
    budgetVersion: 1,
    budget: {
      maxRequests: 30,
      maxFailedTurns: 2,
      maxTurns: 12,
      requests: 4,
      failedTurns: 0,
      turns: 2,
    },
    members: [],
    roleModels: {},
    memberModels: {},
    worktreeRequired: false,
  };
  const swarmFile = path.join(swarmDir, 'members.json');
  const bindingFile = path.join(root, 'swarms/latest.json');
  write(swarmFile, swarm);
  write(path.join(swarmDir, 'owner.json'), {
    id: swarmId,
    ownerPid: exitedOwner.pid,
    budgetVersion: 1,
  });
  write(bindingFile, { id: swarmId, ownerPid: exitedOwner.pid });
  fs.writeFileSync(
    path.join(swarmDir, 'board.jsonl'),
    JSON.stringify({
      seq: 1,
      sender: 'coordinator',
      text: swarm.objective,
      time: '2026-01-01T00:00:00.000Z',
    }) + '\n',
  );
  const hashes = () =>
    Object.fromEntries(
      fs
        .readdirSync(root, { recursive: true })
        .sort()
        .flatMap((relative) => {
          const file = path.join(root, relative);
          return fs.statSync(file).isFile() &&
            /^(agent-workflows|swarms)[\\/]/.test(relative)
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
  const unchanged = async (name, input, expected, exit = 42) => {
    const before = hashes();
    try {
      await run(input, expected, exit);
    } finally {
      preserved.push({ name, before, after: hashes() });
    }
    assert.deepEqual(hashes(), before);
  };
  for (const phase of ['active', 'blocked']) {
    write(swarmFile, { ...swarm, phase });
    await unchanged(
      phase + ' Swarm / Boost',
      '/boost resume ' + boost,
      'pending swarm',
    );
    await unchanged(
      phase + ' Swarm / Teamwork',
      '/teamwork resume ' + teamwork,
      'pending swarm',
    );
  }
  fs.writeFileSync(bindingFile, '{damaged-binding');
  await unchanged('damaged Swarm binding', '/boost resume ' + boost, 'damaged');
  write(bindingFile, { id: swarmId, ownerPid: exitedOwner.pid });
  write(swarmFile, swarm);
  const boostBytes = fs.readFileSync(workflowFile(boost));
  write(workflowFile(boost), { ...JSON.parse(boostBytes), phase: 'completed' });
  await unchanged(
    'completed local despite active Swarm',
    '/boost resume ' + boost,
    'already complete',
    0,
  );
  fs.writeFileSync(workflowFile(boost), boostBytes);
  write(swarmFile, { ...swarm, phase: 'cancelled' });
  const beforeAllowed = hashes();
  expectedResumeId = teamwork;
  await run('/teamwork resume ' + teamwork, 'EXPLICIT_DRAFT_AFTER_SWARM', 0, 1);
  const resumed = JSON.parse(fs.readFileSync(workflowFile(teamwork), 'utf8'));
  const budget = JSON.parse(
    fs.readFileSync(path.join(workflows, teamwork + '.budget.json'), 'utf8'),
  );
  const binding = JSON.parse(
    fs.readFileSync(path.join(workflows, 'current.json'), 'utf8'),
  );
  assert.equal(resumed.phase, 'scoping');
  assert.equal(resumed.approved, false);
  assert.equal(binding.id, teamwork);
  assert.equal(budget.requests, 8);
  assert.equal(budget.maxRequests, 30);
  assert.equal(budget.failedStages, 0);
  assert.deepEqual(budget.implementationRounds, []);
  const afterAllowed = hashes();
  const unaffected = (file) =>
    file.startsWith('swarms') || file.includes(boost);
  const unaffectedBefore = Object.fromEntries(
    Object.entries(beforeAllowed).filter(([file]) => unaffected(file)),
  );
  const unaffectedAfter = Object.fromEntries(
    Object.entries(afterAllowed).filter(([file]) => unaffected(file)),
  );
  assert.deepEqual(unaffectedAfter, unaffectedBefore);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].accepted, true);
  assert.equal(timedOut, false);
  const result = {
    passed: true,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    localRuns: runs.map(({ input, exitCode }) => ({ input, exitCode })),
    preserved,
    unaffectedBefore,
    unaffectedAfter,
    resumed: {
      id: teamwork,
      phase: resumed.phase,
      approved: resumed.approved,
      budget,
      bindingId: binding.id,
    },
    checks: {
      activeAndBlockedSwarmRefused: true,
      damagedBindingRefused: true,
      noMutationOnRefusal: true,
      completedLocal: true,
      terminalSwarmAllowsDraft: true,
      unapprovedStillScoping: true,
      cumulativeBudgetRetained: true,
      exactlyOneAllowedRequest: true,
    },
    scope:
      'Native Boost/Teamwork resume against host-seeded active/blocked/damaged Swarm state, completed local exit and one loopback interview after cancellation. No real paid task rerun or new multi-agent delivery.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      version: metadata.version,
      commands: runs.length,
      preservedCases: preserved.length,
      requests: requests.length,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        timedOut,
        requests,
        preserved,
        localRuns: runs.map(({ input, exitCode }) => ({ input, exitCode })),
        error: error.message,
      },
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
