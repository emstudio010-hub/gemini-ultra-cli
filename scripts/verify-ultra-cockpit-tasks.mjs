import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { setInterval, clearInterval } from 'node:timers';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2]);
const serve = process.argv.includes('--serve');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-cockpit-tasks-'));
const root = path.join(scratch, 'project');
for (const [key, name] of Object.entries({
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_PROMPTS_FILE: 'prompts.json',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(scratch, name);
const load = (relative) =>
  import(pathToFileURL(path.join(repo, relative)).href);
const { createSwarm } = await load('packages/core/dist/src/agents/swarm.js');
const { saveSwarmResultText } = await load(
  'packages/core/dist/src/agents/swarmResultText.js',
);
const { I18nManager } = await load(
  'packages/core/dist/src/i18n/i18nManager.js',
);
const { connectDrillSession, startDrillCockpit, stopDrillCockpit } = await load(
  'packages/cli/dist/src/services/drillCockpit.js',
);
I18nManager.getInstance().setLocale('zh');
const swarm = createSwarm(root, 'Inspect saved Swarm progress');
const swarmFile = path.join(root, 'swarms', swarm.id, 'members.json');
const raw = JSON.parse(fs.readFileSync(swarmFile, 'utf8'));
raw.members = [
  {
    name: 'analyst',
    agent: 'researcher',
    brief: 'Read local fixture',
    state: 'waiting',
    turns: 2,
    ...saveSwarmResultText(
      root,
      swarm.id,
      'Native member evidence\n' + 'x'.repeat(16000),
    ),
  },
];
fs.writeFileSync(swarmFile, JSON.stringify(raw));
const boardFile = path.join(root, 'swarms', swarm.id, 'board.jsonl');
fs.writeFileSync(
  boardFile,
  JSON.stringify({
    seq: 1,
    sender: 'analyst',
    time: '2026-11-11T00:00:00Z',
    text: 'Shared evidence <img src=x onerror="alert(1)">',
  }) + '\n',
);
const directory = path.join(root, 'agent-workflows');
fs.mkdirSync(directory, { recursive: true });
function workflow(mode, objective) {
  const id = randomUUID();
  const file = path.join(directory, `${id}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      mode,
      objective,
      brief: objective,
      phase: mode === 'teamwork' ? 'scoping' : 'blocked',
      stage: 'review',
      previousApprovalMode: 'default',
      approved: mode !== 'teamwork',
      milestones: [
        {
          title: 'Deliver artifact',
          acceptance: 'Evidence retained',
          completed: false,
        },
      ],
      reports: [
        {
          agent: 'coder',
          stage: 'implementation',
          completed: false,
          text: 'Saved partial implementation',
        },
      ],
      updatedAt: '2026-11-11T00:00:00Z',
    }),
  );
  return { mode, id, file };
}
const modes = ['teamwork', 'boost', 'grill-me'].map((mode) =>
  workflow(mode, `Inspect saved ${mode}`),
);
for (let index = 0; index < 17; index++) {
  const item = workflow('teamwork', `Older task ${index + 1}`);
  const time = new Date(1700000000000 + index * 1000);
  fs.utimesSync(item.file, time, time);
}
const brokenId = randomUUID();
fs.writeFileSync(
  path.join(directory, `${brokenId}.json`),
  '{PRIVATE_BROKEN_NATIVE_TASK',
);
const boost = modes.find((item) => item.mode === 'boost');
fs.writeFileSync(
  path.join(directory, `${boost.id}.budget.json`),
  JSON.stringify({
    id: boost.id,
    mode: 'boost',
    ownerPid: process.pid,
    maxRequests: 30,
    maxFailedStages: 2,
    maxImplementationRounds: 2,
    state: 'paused',
    requests: 7,
    failedStages: 1,
    implementationRounds: [1],
    accountingUnknown: false,
  }),
);
const grill = modes.find((item) => item.mode === 'grill-me');
fs.writeFileSync(
  path.join(directory, `${grill.id}.budget.json`),
  '{PRIVATE_BROKEN_NATIVE_BUDGET',
);
fs.writeFileSync(path.join(directory, 'current.json'), '{BROKEN_BINDING');
fs.writeFileSync(path.join(root, 'swarms/latest.json'), '{BROKEN_BINDING');
const hashes = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? hashes(file)
        : [
            {
              file: path.relative(root, file),
              sha256: createHash('sha256')
                .update(fs.readFileSync(file))
                .digest('hex'),
            },
          ];
    })
    .sort((a, b) => a.file.localeCompare(b.file));
const before = hashes(root);
const submissions = [];
const disconnect = connectDrillSession({
  config: {
    storage: { getProjectTempDir: () => root },
    getSessionId: () => 'native-tasks-fixture',
    getApprovalMode: () => 'default',
    getModel: () => 'local-fixture',
    getSkillManager: () => ({ getSkills: () => [], getAllSkills: () => [] }),
  },
  isReady: () => true,
  submit: async (prompt) => {
    submissions.push(prompt);
    throw new Error('No task submission expected');
  },
});
const url = new URL(await startDrillCockpit());
const api = async (endpoint, extraHeaders = {}) => {
  const response = await globalThis.fetch(url.origin + '/api/' + endpoint, {
    headers: { 'X-Drill-Token': url.hash.slice(1), ...extraHeaders },
  });
  return { status: response.status, data: await response.json() };
};
const checks = {};
let retained = false;
try {
  assert.equal(
    (await api('agent-tasks', { 'X-Drill-Token': 'invalid' })).status,
    403,
  );
  assert.equal(
    (
      await api('agent-task?mode=swarm&id=' + swarm.id, {
        Origin: 'https://untrusted.invalid',
      })
    ).status,
    403,
  );
  for (const endpoint of [
    'agent-tasks?page=0',
    'agent-tasks?page=../escape',
    'agent-task?mode=swarm&id=../escape',
    'agent-task?mode=unknown&id=' + swarm.id,
  ])
    assert.equal((await api(endpoint)).status, 400);
  checks.authenticationAndSelection = true;
  const first = (await api('agent-tasks')).data,
    second = (await api('agent-tasks?page=2')).data;
  assert.equal(first.total, 22);
  assert.equal(first.entries.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(second.entries.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((item) => item.id)).size,
    22,
  );
  const details = [];
  for (const item of [...modes, { mode: 'swarm', id: swarm.id }]) {
    const response = await api(`agent-task?mode=${item.mode}&id=${item.id}`);
    assert.equal(response.status, 200);
    assert.equal(response.data.mode, item.mode);
    details.push(response.data);
  }
  assert.deepEqual(details.find((item) => item.mode === 'boost').usage, {
    known: true,
    requests: 7,
    maxRequests: 30,
  });
  assert.equal(
    details.find((item) => item.mode === 'teamwork').usage.requests,
    null,
  );
  assert.equal(
    details.find((item) => item.mode === 'grill-me').usage.known,
    false,
  );
  const member = details.find((item) => item.mode === 'swarm').members[0];
  assert.ok(member.fullResultPath);
  assert.equal(member.previewOnly, true);
  assert.equal(
    details
      .find((item) => item.mode === 'swarm')
      .posts[0].text.includes('<img'),
    true,
  );
  checks.allModesProgressResultsAndUnknownUsage = true;
  const damaged = await api(`agent-task?mode=boost&id=${brokenId}`),
    mismatched = await api(`agent-task?mode=boost&id=${modes[0].id}`);
  assert.equal(damaged.status, 400);
  assert.equal(mismatched.status, 400);
  assert.ok(
    !JSON.stringify([first, second, details, damaged]).includes(
      'PRIVATE_BROKEN',
    ),
  );
  const after = hashes(root);
  assert.deepEqual(after, before);
  assert.equal(submissions.length, 0);
  checks.readOnlyPaginationAndDamagedRecords = true;
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: true,
        platform: process.platform,
        checks,
        modelRequests: 0,
        total: first.total,
        pages: [first.entries.length, second.entries.length],
        details,
        before,
        after,
        scope:
          'Real HTTP handlers over isolated native persisted fixtures; no engine run, task dispatch, model requests or budget migration. Selected archive paths are references, not a fresh archive-content verification.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      checks,
      total: first.total,
      modelRequests: 0,
    }),
  );
  if (serve) {
    fs.writeFileSync(
      output.replace(/\.json$/, '-live.json'),
      JSON.stringify(
        { url: url.href, root, scratch, swarmId: swarm.id, swarmFile, modes },
        null,
        2,
      ),
    );
    const keepalive = setInterval(() => {}, 1000);
    retained = true;
    const shutdown = () => {
      clearInterval(keepalive);
      disconnect();
      stopDrillCockpit();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
} finally {
  if (!retained) {
    disconnect();
    stopDrillCockpit();
  }
}
