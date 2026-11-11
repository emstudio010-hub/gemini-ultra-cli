import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-native-locale-'));
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
  await run('/drill status', 'Drill Workbench Status');
  await run('/redteam on', 'Record your drill authorization', 42);
  assert.equal(fs.existsSync(env.GEMINI_ULTRA_RUNTIME_FILE), false);
  await run('/drill grant', 'Drill authorization recorded');
  await run('/redteam on', 'Red-team workflow enabled');
  await run('/team team 2', 'Collaboration settings saved');
  await run('/drill facts', 'Drill Facts and Reverse Artifacts');
  const runtime = JSON.parse(
    fs.readFileSync(env.GEMINI_ULTRA_RUNTIME_FILE, 'utf8'),
  );
  assert.equal(runtime.collaboration, 'team');
  assert.equal(runtime.maxParallel, 2);
  assert.equal(runtime.workflow, 'redteam');
  await run('/language 中文', '界面语言已切换为中文');
  await run('/team status', '协作模式');
  await run('/redteam status', '红队工作流');
  await run('/演练台 状态', '红队与逆向演练台状态');
  await run('/drill facts', '演练事实与逆向工件列表');
  await run('/drill unknown-operation', '未知操作', 42);
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
    checks: {
      englishDrillFeedback: true,
      chineseFeedbackAndAlias: true,
      grantGateRetained: true,
      collaborationAndWorkflowRetained: true,
      localCommandsNoModel: true,
      unknownOperationIsError: true,
    },
    scope:
      'Installed CLI local commands with isolated settings, grant and SQLite. No external model, browser, reverse tools, user database or paid task. Raw fact preservation and browser text are separately checked by focused command tests.',
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
  assert.match(path.basename(scratch), /^ultra-native-locale-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
