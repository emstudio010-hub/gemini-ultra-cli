import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-swarm-redteam-'));
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
let config;
const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = () => {
  fetches++;
  throw new Error('No network permitted in this fixture');
};
try {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  config = new core.Config({
    sessionId: 'swarm-redteam-fixture',
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
  const manage = config.toolRegistry.getTool('manage_swarm');
  assert.ok(
    manage.schema.parametersJsonSchema.properties.agent.enum.includes(
      'redteam-analyst',
    ),
  );
  const analyst = config.getAgentRegistry().getDefinition('redteam-analyst');
  assert.equal(analyst.kind, 'local');
  const outsideTools = analyst.toolConfig.tools;
  assert.ok(outsideTools.includes('binary_analyze'));
  for (const denied of [
    'run_shell_command',
    'write_file',
    'replace',
    'spawn_subagents',
    'manage_swarm',
    'post_swarm_message',
  ])
    assert.ok(!outsideTools.includes(denied), denied);

  const taskRoot = config.storage.getProjectTempDir();
  const swarm = core.createSwarm(
    taskRoot,
    'Review two supplied local sources within their explicit scope',
  );
  core.setSwarmModel(
    taskRoot,
    swarm.id,
    'redteam-analyst',
    'native:gemini-fixture',
  );
  let count = 0,
    entered = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const reports = new Map();
  const engine = core.getSwarmEngine(
    taskRoot,
    swarm.id,
    async (agent, _prompt, signal) => {
      count++;
      if (agent === 'workflow-auditor') {
        for (const member of core
          .readSwarm(taskRoot, swarm.id)
          .members.filter((member) => member.agent === 'redteam-analyst')) {
          assert.equal(
            fs.readFileSync(
              path.join(
                taskRoot,
                'swarms',
                swarm.id,
                'results',
                `full-${member.fullResult.sha256}.md`,
              ),
              'utf8',
            ),
            reports.get(member.name),
          );
        }
        return {
          completed: true,
          text: JSON.stringify({
            passed: true,
            summary: 'Fixture inspected retained reports',
            evidence: [...reports.keys()],
          }),
        };
      }
      assert.equal(agent, 'redteam-analyst');
      assert.equal(core.currentAgentModel(), 'native:gemini-fixture');
      assert.ok(analyst.toolConfig.tools.includes('post_swarm_message'));
      assert.ok(!analyst.toolConfig.tools.includes('run_shell_command'));
      entered++;
      if (entered === 2) release();
      await Promise.race([
        barrier,
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
      ]);
      const actor = core.currentSwarmActor();
      core.postSwarmMessage(
        taskRoot,
        swarm.id,
        actor.name,
        'Evidence retained for ' + actor.name,
      );
      const text =
        'Scoped evidence for ' +
        actor.name +
        '\n' +
        'Local source observation.\n'.repeat(600);
      reports.set(actor.name, text);
      return { completed: true, text };
    },
  );
  const state = () => core.readSwarm(taskRoot, swarm.id);
  const before = JSON.stringify(state());
  assert.throws(
    () => engine.add('denied', 'redteam-analyst', 'Read only'),
    /authorization/i,
  );
  assert.equal(JSON.stringify(state()), before);
  assert.equal(count, 0);
  core.writeDrillGrant(true);
  engine.add('alpha', 'redteam-analyst', 'Read alpha.ts only; cite evidence');
  engine.add('beta', 'redteam-analyst', 'Read beta.ts only; cite evidence');
  await engine.wait(globalThis.AbortSignal.timeout(5000));
  assert.equal(count, 2);
  assert.ok(
    state().members.every(
      (member) => member.state === 'waiting' && member.fullResult,
    ),
  );
  assert.throws(() => engine.finish(), /independent verifier/i);
  core.writeDrillGrant(false);
  engine.post('coordinator', '@alpha follow up within the same scope');
  await engine.wait(globalThis.AbortSignal.timeout(5000));
  assert.equal(count, 2);
  assert.equal(state().members[0].state, 'paused');
  assert.match(state().members[0].result, /authorization/i);
  assert.throws(() => engine.finish(), /paused/i);
  core.writeDrillGrant(true);
  engine.post('coordinator', '@alpha resume after authorization is restored');
  await engine.wait(globalThis.AbortSignal.timeout(5000));
  engine.add(
    'verifier',
    'workflow-auditor',
    'Read both retained reports and return an independent verdict',
  );
  await engine.wait(globalThis.AbortSignal.timeout(5000));
  assert.ok(
    state().members.every((member) => member.state === 'waiting'),
    JSON.stringify(state().members),
  );
  engine.finish();
  assert.equal(state().phase, 'completed');
  assert.equal(count, 4);
  assert.equal(state().budget.requests, 0);
  assert.equal(fetches, 0);
  const result = {
    node: process.version,
    platform: process.platform,
    source,
    role: 'redteam-analyst',
    phase: state().phase,
    memberTurns: count,
    networkRequests: fetches,
    modelRequests: 0,
    checks: [
      'packaged-tool-schema',
      'registered-local-read-only-role',
      'independent-role-model',
      'concurrent-analysts',
      'public-identity',
      'full-result-archives',
      'grant-required-before-add',
      'revocation-before-new-turn',
      'restored-grant-resume',
      'independent-current-verdict',
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
