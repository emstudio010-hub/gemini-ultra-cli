import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-swarm-result-recovery-'),
);
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_PROMPTS_FILE: 'prompts.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(root, name);
let module;
if (source) module = path.join(repo, 'packages/core/dist/index.js');
else {
  const directory = path.dirname(entry);
  module = fs
    .readdirSync(directory)
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(directory, name))
    .find((file) =>
      /(?:var|class) SwarmEngine\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged SwarmEngine missing');
}
const core = await import(pathToFileURL(module).href);
const originalFetch = globalThis.fetch;
let fetches = 0,
  calls = 0,
  config;
globalThis.fetch = () => {
  fetches++;
  throw new Error('No network allowed');
};
try {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  config = new core.Config({
    sessionId: 'swarm-result-recovery',
    model: 'fixture',
    targetDir: workspace,
    cwd: workspace,
    debugMode: false,
    usageStatisticsEnabled: false,
    useRipgrep: false,
    skillsSupport: false,
    enableHooks: false,
  });
  await config.initialize();
  const taskRoot = config.storage.getProjectTempDir();
  const swarm = core.createSwarm(
    taskRoot,
    'Keep accepted source evidence through a failed follow-up',
  );
  const text =
    'Retained original evidence\n' + 'Bounded observation\n'.repeat(900);
  const expectedHash = createHash('sha256').update(text).digest('hex');
  const state = () => core.readSwarm(taskRoot, swarm.id);
  const engine = core.getSwarmEngine(taskRoot, swarm.id, async (agent) => {
    calls++;
    if (calls === 2) {
      core.observeAgentModel('fixture:failed-attempt');
      throw new Error('Follow-up transport interrupted');
    }
    if (agent === 'workflow-auditor')
      return {
        completed: true,
        text: JSON.stringify({
          passed: true,
          summary: 'Controlled review of the retried deliverable',
          evidence: ['retained archive', 'new reader result'],
        }),
      };
    core.observeAgentModel('fixture:accepted-result');
    return {
      completed: true,
      text: calls === 1 ? text : 'New accepted result after explicit retry',
    };
  });
  const signal = () => globalThis.AbortSignal.timeout(5000);
  engine.add('reader', 'researcher', 'Inspect only the assigned local source');
  await engine.wait(signal());
  const before = state().members[0];
  assert.equal(before.fullResult.sha256, expectedHash);
  engine.post('coordinator', '@reader inspect the remaining question');
  await engine.wait(signal());
  const paused = state().members[0];
  assert.equal(paused.state, 'paused');
  assert.equal(paused.lastError, 'Follow-up transport interrupted');
  assert.deepEqual(paused.fullResult, before.fullResult);
  assert.equal(paused.result, before.result);
  assert.deepEqual(paused.modelsUsed, ['fixture:accepted-result']);
  const archive = path.join(
    taskRoot,
    'swarms',
    swarm.id,
    'results',
    `full-${paused.fullResult.sha256}.md`,
  );
  assert.equal(fs.readFileSync(archive, 'utf8'), text);
  assert.equal(
    core.swarmSnapshot(taskRoot, swarm.id).members[0].lastError,
    paused.lastError,
  );
  const model = core.swarmModelSnapshot(taskRoot, swarm.id).members[0];
  assert.equal(model.lastError.text, paused.lastError);
  assert.equal(fs.readFileSync(model.result.fullText, 'utf8'), text);
  const detail = core.readAgentTaskDetails(taskRoot, {
    mode: 'swarm',
    id: swarm.id,
  });
  assert.equal(detail.members[0].lastError, paused.lastError);
  assert.equal(detail.members[0].preview, before.result.slice(0, 1200));
  const exported = core.exportSwarmReports(taskRoot, swarm.id);
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath, 'utf8'));
  assert.equal(manifest.reports[0].sha256, expectedHash);
  assert.equal(
    fs.readFileSync(
      path.join(path.dirname(exported.manifestPath), manifest.reports[0].file),
      'utf8',
    ),
    text,
  );
  const snapshot = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(exported.manifestPath), 'snapshot.json'),
      'utf8',
    ),
  );
  assert.equal(snapshot.record.members[0].lastError, paused.lastError);
  assert.ok(
    core
      .readSwarmBoard(taskRoot, swarm.id)
      .at(-1)
      .text.includes(paused.lastError),
  );
  assert.throws(() => engine.finish(), /paused/i);
  engine.post('coordinator', '@reader retry after recovery');
  await engine.wait(signal());
  assert.equal(state().members[0].lastError, undefined);
  assert.equal(
    state().members[0].result,
    'New accepted result after explicit retry',
  );
  assert.equal(state().budget.failedTurns, 1);
  engine.add(
    'verifier',
    'workflow-auditor',
    'Inspect the current deliverable independently',
  );
  await engine.wait(signal());
  engine.finish();
  assert.equal(state().phase, 'completed');
  assert.equal(calls, 4);
  assert.equal(fetches, 0);
  const result = {
    passed: true,
    platform: process.platform,
    node: process.version,
    source,
    phase: state().phase,
    memberTurns: calls,
    modelRequests: 0,
    networkRequests: fetches,
    retainedHash: expectedHash,
    checks: [
      'retained-result-and-archive',
      'retained-result-models',
      'separate-last-error',
      'model-context-full-handoff',
      'cockpit-detail-error',
      'export-preserves-full-report-and-error',
      'paused-is-not-complete',
      'explicit-retry-clears-error',
      'cumulative-failed-turn',
      'current-independent-verdict',
    ],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  globalThis.fetch = originalFetch;
  await config?.dispose();
  core.DrillStore?.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
}
