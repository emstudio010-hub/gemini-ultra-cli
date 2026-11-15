/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-goal-package-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
fs.writeFileSync(
  path.join(workspace, 'seed.txt'),
  'The requested result is answer=42.\n',
);
fs.writeFileSync(
  path.join(profile, '.gemini/settings.json'),
  JSON.stringify({
    security: { auth: { selectedType: 'gateway' } },
    privacy: { usageStatisticsEnabled: false },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
  }),
);
const requests = [];
const failures = [];
const call = (name, args) => ({
  tool_calls: [
    {
      id: randomUUID(),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.ok(requests.length < 24, 'Bounded fixture request limit exceeded');
    const system = payload.messages
      .filter((item) => item.role === 'system')
      .map((item) => item.content)
      .join('\n');
    const role = system.includes('Role: researcher')
      ? 'researcher'
      : system.includes('Role: coder')
        ? 'coder'
        : system.includes(
              'Independently inspect actual files against the assigned acceptance criteria.',
            )
          ? 'auditor'
          : 'main';
    const results = payload.messages.filter((item) => item.role === 'tool');
    const tools = payload.tools.map((item) => item.function.name);
    requests.push({ role, tools, results: results.length });
    let message;
    if (role === 'main') {
      if (results.length === 0) {
        assert.ok(tools.includes('manage_drill_goal'));
        message = call('manage_drill_goal', {
          action: 'create',
          objective:
            'Read seed.txt and deliver DRILL-REPORT.md containing exactly answer=42 followed by newline.',
          reviewFiles: ['DRILL-REPORT.md'],
          milestones: [
            {
              title: 'Deliver the report',
              acceptance:
                'DRILL-REPORT.md contains exactly answer=42 followed by newline; seed.txt is unchanged.',
            },
          ],
        });
      } else if (results.length === 1) {
        const id = results[0].content.match(
          /workflow_id=([0-9a-f-]{36})/i,
        )?.[1];
        assert.ok(
          id,
          'Native goal creation must return its persisted workflow ID',
        );
        message = call('run_agent_workflow', {
          workflow_id: id,
          review_files: [],
        });
      } else
        message = {
          content: 'Native goal completed. The saved report is ready.',
        };
    } else if (role === 'researcher') {
      message = results.length
        ? call('complete_task', {
            result: {
              response:
                'Read seed.txt. The declared report must contain answer=42 followed by newline.',
            },
          })
        : call('read_file', { file_path: path.join(workspace, 'seed.txt') });
    } else if (role === 'coder') {
      assert.ok(
        !tools.includes('manage_drill_goal'),
        'Workers must not create nested goals',
      );
      message = results.length
        ? call('complete_task', {
            result: {
              response: 'Wrote DRILL-REPORT.md. No unrelated changes or tests.',
            },
          })
        : call('write_file', {
            file_path: path.join(workspace, 'DRILL-REPORT.md'),
            content: 'answer=42\n',
          });
    } else {
      assert.ok(!tools.includes('write_file'));
      message = results.length
        ? call('complete_task', {
            verdict: {
              passed: true,
              summary:
                'Independently read the declared report and matched the required result.',
              evidence: ['DRILL-REPORT.md: answer=42'],
            },
          })
        : call('read_file', {
            file_path: path.join(workspace, 'DRILL-REPORT.md'),
          });
      if (results.length)
        assert.ok(results.some((item) => item.content.includes('answer=42')));
    }
    if (payload.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: message,
                finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
              },
            ],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', ...message },
              finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
            },
          ],
        }),
      );
    }
  } catch (error) {
    failures.push(error.message);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'Goal package fixture: ' + error.message },
      }),
    );
  }
});
const started = Date.now();
let child;
let timer;
let result = {
  passed: false,
  evidence:
    'Installed CLI with a deterministic loopback model. Not live-provider quality acceptance.',
};
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'fixture-goal',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'fixture',
          name: 'Fixture',
          baseUrl: 'http://127.0.0.1:' + server.address().port,
          apiKey: 'fixture-only',
          protocol: 'openai-chat',
          models: ['fixture-goal'],
          defaultModel: 'fixture-goal',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  const env = {
    ...process.env,
    HOME: profile,
    USERPROFILE: profile,
    GEMINI_CLI_HOME: profile,
    GEMINI_CLI_NO_RELAUNCH: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_PROVIDERS_FILE: providers,
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
    GEMINI_PTY_INFO: 'child_process',
    NO_PROXY: '*',
    NO_COLOR: '1',
  };
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENAI_USE_GCA',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'GOOGLE_GEMINI_BASE_URL',
    'GEMINI_DEFAULT_AUTH_TYPE',
    'GEMINI_CLI_AUTH_OVERRIDE',
  ])
    delete env[key];
  child = spawn(
    process.execPath,
    [
      entry,
      '-y',
      '-m',
      'fixture-goal',
      '-p',
      'Create one persistent drill goal for the requested seed report, execute it with the native workflow, and deliver it.',
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
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  timer = setTimeout(() => child.kill(), 120000);
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  clearTimeout(timer);
  fs.writeFileSync(path.join(scratch, 'stdout.log'), stdout);
  fs.writeFileSync(path.join(scratch, 'stderr.log'), stderr);
  assert.equal(exitCode, 0, stderr.slice(-3000));
  assert.deepEqual(failures, []);
  assert.equal(
    fs.readFileSync(path.join(workspace, 'DRILL-REPORT.md'), 'utf8'),
    'answer=42' + os.EOL,
  );
  assert.equal(
    fs.readFileSync(path.join(workspace, 'seed.txt'), 'utf8'),
    'The requested result is answer=42.\n',
  );
  const records = fs
    .readdirSync(profile, { recursive: true })
    .filter((file) => /agent-workflows[\\/][0-9a-f-]{36}\.json$/i.test(file));
  assert.equal(records.length, 1);
  const file = path.join(profile, records[0]);
  const goal = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(goal.phase, 'completed');
  assert.ok(goal.drillGoal);
  assert.ok(goal.milestones.every((item) => item.completed));
  assert.deepEqual(goal.reviewFiles, ['DRILL-REPORT.md']);
  assert.equal(goal.reviewedFiles.files.length, 1);
  assert.equal(goal.reports.length, 5);
  const budget = JSON.parse(
    fs.readFileSync(file.replace(/\.json$/, '.budget.json'), 'utf8'),
  );
  assert.ok(budget.requests > 0);
  assert.equal(budget.state, 'closed');
  result = {
    ...result,
    passed: true,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    goalId: goal.id,
    phase: goal.phase,
    requests: requests.length,
    nativeBudgetRequests: budget.requests,
    stageReports: goal.reports.length,
    scratch,
    elapsedMs: Date.now() - started,
  };
} catch (error) {
  result = {
    ...result,
    error: error.message,
    scratch,
    requests,
    failures,
    elapsedMs: Date.now() - started,
  };
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child?.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
