import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const phase = process.argv[4];
const original = 'Accepted local evidence\n'.repeat(900);
const partial =
  'Interrupted follow-up observation\n'.repeat(900) + 'PARTIAL-END';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const fixture = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const workerRoot = process.argv[5];

if (!phase) {
  const scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ultra-swarm-incomplete-'),
  );
  try {
    const logs = [];
    for (const operation of ['produce', 'resume']) {
      logs.push(
        execFileSync(
          process.execPath,
          [fileURLToPath(import.meta.url), entry, output, operation, scratch],
          { encoding: 'utf8', timeout: 30000, windowsHide: true },
        ),
      );
    }
    const first = fixture(path.join(scratch, 'produce.json'));
    const resumed = fixture(path.join(scratch, 'resume.json'));
    assert.notEqual(first.pid, resumed.pid);
    assert.equal(first.id, resumed.id);
    const result = {
      passed: true,
      platform: process.platform,
      node: process.version,
      phase: resumed.phase,
      producerExitCode: 0,
      resumeExitCode: 0,
      differentProcesses: true,
      modelRequests: 0,
      networkRequests: 0,
      retainedHash: sha(original),
      partialHash: sha('Member turn did not complete.\n' + partial),
      checks: [
        'incomplete-return-retains-accepted-result-and-models',
        'partial-output-archived-separately',
        'snapshot-context-export-retain-original',
        'paused-cannot-finish',
        'dead-owner-explicit-resume',
        'resume-retains-counters-model-and-reports',
        'explicit-retry-clears-error',
        'partial-archive-survives-retry',
        'independent-verdict-before-finish',
      ],
      producer: first,
      resumed,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    fs.writeFileSync(output.replace(/\.json$/, '-output.txt'), logs.join('\n'));
    console.log(JSON.stringify(result));
  } finally {
    assert.equal(path.dirname(scratch), os.tmpdir());
    assert.match(path.basename(scratch), /^ultra-swarm-incomplete-/);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
} else {
  assert.ok(['produce', 'resume'].includes(phase));
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
    process.env[key] = path.join(workerRoot, name);
  const module = fs
    .readdirSync(path.dirname(entry))
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(path.dirname(entry), name))
    .find((file) =>
      /(?:var|class) SwarmEngine\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged SwarmEngine missing');
  const core = await import(pathToFileURL(module).href);
  const priorFetch = globalThis.fetch;
  let fetches = 0,
    config;
  globalThis.fetch = () => {
    fetches++;
    throw new Error('No network allowed');
  };
  try {
    const workspace = path.join(workerRoot, 'workspace');
    fs.mkdirSync(workspace, { recursive: true });
    config = new core.Config({
      sessionId: 'incomplete-' + phase,
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
    const root = config.storage.getProjectTempDir();
    const signal = () => globalThis.AbortSignal.timeout(5000);
    if (phase === 'produce') {
      const swarm = core.createSwarm(
        root,
        'Retain prior evidence across an incomplete turn and process exit',
      );
      let calls = 0;
      const engine = core.getSwarmEngine(root, swarm.id, async () => {
        calls++;
        core.observeAgentModel(
          calls === 1 ? 'fixture:accepted' : 'fixture:incomplete',
        );
        return {
          completed: calls === 1,
          text: calls === 1 ? original : partial,
        };
      });
      engine.add('reader', 'researcher', 'Inspect only the assigned source');
      await engine.wait(signal());
      engine.post('coordinator', '@reader inspect the remaining question');
      await engine.wait(signal());
      const state = core.readSwarm(root, swarm.id),
        member = state.members[0];
      assert.equal(calls, 2);
      assert.equal(member.state, 'paused');
      assert.equal(member.fullResult.sha256, sha(original));
      assert.deepEqual(member.modelsUsed, ['fixture:accepted']);
      const model = core.swarmModelSnapshot(root, swarm.id).members[0];
      assert.equal(fs.readFileSync(model.result.fullText, 'utf8'), original);
      assert.ok(model.lastError);
      const partialPath = member.lastError.match(
        /Partial output archived: ([^\n]+)/,
      )?.[1];
      assert.ok(partialPath);
      assert.equal(
        fs.readFileSync(partialPath, 'utf8'),
        'Member turn did not complete.\n' + partial,
      );
      assert.notEqual(partialPath, model.result.fullText);
      const exported = core.exportSwarmReports(root, swarm.id),
        manifest = fixture(exported.manifestPath);
      assert.equal(manifest.reports[0].sha256, sha(original));
      assert.equal(
        fs.readFileSync(
          path.join(
            path.dirname(exported.manifestPath),
            manifest.reports[0].file,
          ),
          'utf8',
        ),
        original,
      );
      assert.equal(
        core.readAgentTaskDetails(root, { mode: 'swarm', id: swarm.id })
          .members[0].lastError,
        member.lastError,
      );
      assert.equal(
        core.swarmSnapshot(root, swarm.id).members[0].fullResult.sha256,
        sha(original),
      );
      assert.throws(() => engine.finish(), /paused/);
      assert.equal(fetches, 0);
      fs.writeFileSync(
        path.join(workerRoot, 'produce.json'),
        JSON.stringify({
          pid: process.pid,
          id: swarm.id,
          budget: state.budget,
          member,
          partialPath,
          originalPath: model.result.fullText,
          board: fs.readFileSync(
            path.join(root, 'swarms', swarm.id, 'board.jsonl'),
            'utf8',
          ),
        }),
      );
    } else {
      const previous = fixture(path.join(workerRoot, 'produce.json'));
      assert.throws(
        () => process.kill(previous.pid, 0),
        (error) => error.code === 'ESRCH',
      );
      await core.resumeSwarm(root, previous.id);
      const resumed = core.readSwarm(root, previous.id);
      assert.equal(resumed.ownerPid, process.pid);
      assert.equal(resumed.phase, 'active');
      assert.deepEqual(resumed.budget, previous.budget);
      assert.deepEqual(resumed.members[0], previous.member);
      assert.ok(
        core.readSwarmBoard(root, previous.id).length >
          previous.board.trim().split('\n').length,
      );
      assert.equal(fs.readFileSync(previous.originalPath, 'utf8'), original);
      assert.equal(
        fs.readFileSync(previous.partialPath, 'utf8'),
        'Member turn did not complete.\n' + partial,
      );
      let calls = 0;
      const engine = core.getSwarmEngine(root, previous.id, async (agent) => {
        calls++;
        if (agent === 'workflow-auditor')
          return {
            completed: true,
            text: JSON.stringify({
              passed: true,
              summary: 'Controlled verdict on the explicit retry',
              evidence: [
                'retained original and partial archives',
                'new reader result',
              ],
            }),
          };
        core.observeAgentModel('fixture:correction');
        return {
          completed: true,
          text: 'Accepted correction after process restart',
        };
      });
      engine.post('coordinator', '@reader retry the unfinished question');
      await engine.wait(signal());
      const corrected = core.readSwarm(root, previous.id);
      assert.equal(
        corrected.members[0].result,
        'Accepted correction after process restart',
      );
      assert.equal(corrected.members[0].lastError, undefined);
      assert.deepEqual(corrected.members[0].modelsUsed, ['fixture:correction']);
      assert.equal(corrected.budget.failedTurns, 1);
      assert.equal(corrected.budget.turns, 3);
      assert.equal(
        fs.readFileSync(previous.partialPath, 'utf8'),
        'Member turn did not complete.\n' + partial,
      );
      engine.add(
        'verifier',
        'workflow-auditor',
        'Independently inspect the current deliverable',
      );
      await engine.wait(signal());
      engine.finish();
      const final = core.readSwarm(root, previous.id);
      assert.equal(final.phase, 'completed');
      assert.equal(calls, 2);
      assert.equal(final.budget.turns, 4);
      assert.equal(fetches, 0);
      fs.writeFileSync(
        path.join(workerRoot, 'resume.json'),
        JSON.stringify({
          pid: process.pid,
          id: previous.id,
          phase: final.phase,
          budget: final.budget,
        }),
      );
    }
  } finally {
    globalThis.fetch = priorFetch;
    await config?.dispose();
    core.DrillStore?.resetInstance();
  }
}
