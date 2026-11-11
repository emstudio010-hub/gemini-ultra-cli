import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-teamwork-cycle-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const objective =
  'Deliver result.txt and USAGE.md in two milestones; preserve SPEC.md and user changes.';
fs.writeFileSync(
  path.join(workspace, 'SPEC.md'),
  'result.txt must contain exactly value=42 followed by newline. USAGE.md must contain 示例：value=42. No edits to SPEC.md, USER.md or user-notes.txt.\n',
);
fs.writeFileSync(path.join(workspace, 'USER.md'), 'original user content\n');
const git = (args) =>
  execFileSync('git', args, {
    cwd: workspace,
    windowsHide: true,
    encoding: 'utf8',
  });
git(['init', '--quiet']);
git(['config', 'user.name', 'Fixture']);
git(['config', 'user.email', 'fixture@invalid']);
git(['config', 'core.autocrlf', 'false']);
git(['add', '.']);
git(['commit', '--quiet', '-m', 'local fixture']);
fs.writeFileSync(path.join(workspace, 'USER.md'), 'user staged\n');
git(['add', 'USER.md']);
fs.writeFileSync(path.join(workspace, 'USER.md'), 'user unstaged\n');
fs.writeFileSync(path.join(workspace, 'user-notes.txt'), 'user untracked\n');
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalHead = git(['rev-parse', 'HEAD']).trim();
const originalIndex = hash(path.join(workspace, '.git/index'));
const originalFiles = Object.fromEntries(
  ['SPEC.md', 'USER.md', 'user-notes.txt'].map((name) => [
    name,
    hash(path.join(workspace, name)),
  ]),
);
let phase = 'local',
  id,
  recordFile,
  worktree;
let child,
  timer,
  timedOut = false;
const requests = [],
  runs = [],
  failures = [];
const readRecord = () => JSON.parse(fs.readFileSync(recordFile, 'utf8'));
const localState = () => {
  const temporary = path.join(profile, '.gemini/tmp');
  const projects = fs
    .readdirSync(temporary, { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(projects.length, 1);
  return path.join(temporary, projects[0].name);
};
const server = createServer(async (req, res) => {
  try {
    assert.notEqual(phase, 'local', 'Local commands must not call any model');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    const system = payload.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    const role = system.includes('Role: researcher')
      ? 'researcher'
      : system.includes('Role: coder')
        ? 'coder'
        : system.includes(
              'Independently inspect actual files against the assigned acceptance criteria.',
            )
          ? 'workflow-auditor'
          : 'main';
    const route =
      role === 'main'
        ? ''
        : role === 'researcher'
          ? 'read'
          : role === 'coder'
            ? 'build'
            : 'review';
    assert.equal(
      req.url,
      route ? `/route-${route}/chat/completions` : '/chat/completions',
    );
    assert.equal(payload.model, route ? `${route}-model` : 'fixture-model');
    const tools = payload.tools.map((tool) => tool.function.name);
    const results = payload.messages.filter(
      (message) => message.role === 'tool',
    );
    const stage = readRecord().stage;
    requests.push({ phase, role, stage, tools, resultCount: results.length });
    assert.ok(requests.length <= 30, 'Bounded fixture request limit exceeded');
    const call = (name, args) => ({
      content: '',
      tool_calls: [
        {
          index: 0,
          id: `teamwork_${requests.length}`,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    const complete = (value) => {
      const schema = payload.tools.find(
        (tool) => tool.function.name === 'complete_task',
      ).function.parameters;
      return call('complete_task', { [schema.required[0]]: value });
    };
    let message;
    if (phase === 'scoping') {
      assert.equal(role, 'main');
      assert.ok(
        tools.includes('draft_agent_workflow'),
        `Draft tool missing from Plan Mode: ${tools.join(', ')}`,
      );
      // Plan Mode retains this tool solely for internal plan documents.
      const writeTool = payload.tools.find(
        (tool) => tool.function.name === 'write_file',
      );
      if (writeTool)
        assert.match(writeTool.function.description, /ONLY FOR PLANS/);
      assert.ok(!tools.includes('run_agent_workflow'));
      if (results.length === 0)
        message = call('read_file', {
          file_path: path.join(workspace, 'SPEC.md'),
        });
      else if (results.length === 1) {
        assert.ok(results[0].content.includes('value=42'));
        message = call('draft_agent_workflow', {
          workflow_id: id,
          brief: objective,
          milestones: [
            {
              title: 'Deliver result',
              acceptance:
                'result.txt contains exactly value=42 followed by newline.',
            },
            {
              title: 'Document usage',
              acceptance:
                'USAGE.md contains 示例：value=42 and result.txt remains unchanged.',
            },
          ],
        });
      } else {
        assert.ok(
          results.at(-1).content.includes('execution has NOT been approved'),
        );
        message = {
          content:
            'TEAMWORK_DRAFT_SAVED. Review the two milestones and use /teamwork approve to execute.',
        };
      }
    } else if (role === 'main') {
      if (results.length === 0)
        message = call('run_agent_workflow', { workflow_id: id });
      else {
        assert.equal(readRecord().phase, 'completed');
        message = { content: 'TEAMWORK_TWO_MILESTONES_DELIVERED' };
      }
    } else {
      assert.ok(!tools.includes('draft_agent_workflow'));
      assert.ok(!tools.includes('run_agent_workflow'));
      const target = path.join(
        worktree.directory,
        stage.includes('2.') ? 'USAGE.md' : 'result.txt',
      );
      if (role === 'researcher') {
        message =
          results.length === 0
            ? call('read_file', {
                file_path: path.join(worktree.directory, 'SPEC.md'),
              })
            : complete({
                response:
                  'Read SPEC.md; hand off this milestone acceptance and preserve user changes.',
              });
      } else if (role === 'coder') {
        message =
          results.length === 0
            ? call('write_file', {
                file_path: target,
                content: stage.includes('2.')
                  ? '# Usage\n\n示例：value=42\n'
                  : 'value=42\n',
              })
            : complete({
                response: `Wrote ${path.basename(target)} only. No test command run; inspect the actual artifact independently.`,
              });
      } else {
        assert.ok(!tools.includes('write_file'));
        assert.ok(!tools.includes('run_shell_command'));
        if (stage === 'final audit' && results.length < 2)
          message = call('read_file', {
            file_path: path.join(
              worktree.directory,
              results.length ? 'USAGE.md' : 'result.txt',
            ),
          });
        else if (results.length === 0)
          message = call('read_file', { file_path: target });
        else {
          const evidence = results.map((result) => result.content).join('\n');
          assert.ok(evidence.includes('value=42'));
          if (stage === 'final audit')
            assert.ok(evidence.includes('示例：value=42'));
          message = complete({
            passed: true,
            summary:
              'Independently read actual milestone files and matched explicit acceptance.',
            evidence: [
              stage === 'final audit'
                ? 'result.txt and USAGE.md contain value=42 as required.'
                : `${path.basename(target)} matched the saved acceptance.`,
            ],
          });
        }
      }
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
    failures.push(error instanceof Error ? error.message : 'Fixture mismatch');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: failures.at(-1) } }));
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    }),
  );
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'fixture-model',
      reasoningEffort: 'low',
      providers: ['', 'read', 'build', 'review'].map((route) => ({
        id: route ? `fixture-${route}` : 'fixture',
        name: `Local ${route || 'main'}`,
        baseUrl: `http://127.0.0.1:${server.address().port}${route ? '/route-' + route : ''}`,
        apiKey: 'fixture-only',
        protocol: 'openai-chat',
        models: [route ? `${route}-model` : 'fixture-model'],
        defaultModel: route ? `${route}-model` : 'fixture-model',
        contextWindow: 64000,
        updatedAt: new Date().toISOString(),
      })),
    }),
  );
  const providerBefore = hash(providers);
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
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_PROVIDERS_FILE: providers,
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
    NO_PROXY: '*',
  });
  const run = async (input) => {
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
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 4 * 1024 * 1024) child.kill();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 4 * 1024 * 1024) child.kill();
    });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 60000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    runs.push({ input, exitCode, requests: requests.length, stdout, stderr });
    assert.equal(exitCode, 0, stdout + stderr);
  };
  await run(`/teamwork prepare ${objective}`);
  const root = localState();
  id = JSON.parse(
    fs.readFileSync(path.join(root, 'agent-workflows/current.json'), 'utf8'),
  ).id;
  recordFile = path.join(root, 'agent-workflows', `${id}.json`);
  assert.equal(readRecord().approved, false);
  await run('/teamwork budget 30 2 1');
  for (const [role, route] of [
    ['researcher', 'read'],
    ['coder', 'build'],
    ['workflow-auditor', 'review'],
  ])
    await run(`/teamwork model ${role} fixture-${route}:${route}-model`);
  await run('/teamwork workspace on');
  worktree = JSON.parse(
    fs.readFileSync(
      path.join(root, 'agent-worktrees', id, 'state.json'),
      'utf8',
    ),
  );
  assert.equal(requests.length, 0);
  phase = 'scoping';
  await run('/teamwork resume');
  const draft = readRecord();
  assert.equal(draft.phase, 'ready');
  assert.equal(draft.approved, false);
  assert.equal(draft.milestones.length, 2);
  assert.equal(draft.reports.length, 0);
  assert.ok(!fs.existsSync(path.join(worktree.directory, 'result.txt')));
  assert.ok(!fs.existsSync(path.join(worktree.directory, 'USAGE.md')));
  const requestsBeforeApproval = requests.length;
  phase = 'execute';
  await run('/teamwork approve');
  const completed = readRecord();
  const ledger = JSON.parse(
    fs.readFileSync(
      path.join(root, 'agent-workflows', `${id}.budget.json`),
      'utf8',
    ),
  );
  assert.equal(completed.phase, 'completed');
  assert.ok(completed.milestones.every((milestone) => milestone.completed));
  assert.equal(completed.reports.length, 7);
  assert.deepEqual(ledger.implementationRounds, [1, 1]);
  assert.equal(ledger.state, 'closed');
  assert.equal(ledger.failedStages, 0);
  assert.ok(!fs.existsSync(path.join(workspace, 'result.txt')));
  assert.ok(!fs.existsSync(path.join(workspace, 'USAGE.md')));
  phase = 'local';
  const beforeLocalExport = requests.length;
  await run('/teamwork workspace export');
  await run('/teamwork workspace apply');
  await run(`/teamwork reports ${id}`);
  assert.equal(requests.length, beforeLocalExport);
  assert.equal(
    fs
      .readFileSync(path.join(workspace, 'result.txt'), 'utf8')
      .replace(/\r\n/g, '\n'),
    'value=42\n',
  );
  assert.equal(
    fs
      .readFileSync(path.join(workspace, 'USAGE.md'), 'utf8')
      .replace(/\r\n/g, '\n'),
    '# Usage\n\n示例：value=42\n',
  );
  for (const name of ['result.txt', 'USAGE.md'])
    assert.equal(
      hash(path.join(workspace, name)),
      hash(path.join(worktree.directory, name)),
      `Apply must preserve ${name} bytes including platform line endings`,
    );
  assert.equal(git(['rev-parse', 'HEAD']).trim(), originalHead);
  assert.equal(hash(path.join(workspace, '.git/index')), originalIndex);
  for (const [name, sha] of Object.entries(originalFiles))
    assert.equal(hash(path.join(workspace, name)), sha);
  assert.equal(hash(providers), providerBefore);
  const manifestRoot = path.join(root, 'agent-reports', id);
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(manifestRoot, fs.readdirSync(manifestRoot)[0], 'manifest.json'),
      'utf8',
    ),
  );
  assert.equal(manifest.reports.length, 7);
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    ),
  );
  const report = {
    passed: !timedOut && failures.length === 0,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requestsBeforeApproval,
    requests: requests.length,
    phases: requests,
    state: completed,
    ledger,
    localRuns: runs.map((run) => ({
      input: run.input,
      exitCode: run.exitCode,
      requests: run.requests,
    })),
    checks: {
      preparedWithoutModel: runs.slice(0, 6).every((run) => run.requests === 0),
      draftUnapprovedAndNoArtifacts:
        draft.approved === false && draft.reports.length === 0,
      onlyExplicitApproveRunsMembers: requests
        .filter((request) => request.role !== 'main')
        .every((request) => request.phase === 'execute'),
      twoMilestonesAndSevenReports:
        completed.milestones.length === 2 && completed.reports.length === 7,
      rolesIndependentlyRouted: completed.reports.every(
        (report) =>
          report.modelsUsed.length === 1 &&
          report.modelsUsed[0] === completed.roleModels[report.agent],
      ),
      originalUserChangesRetained: true,
      sourceIndexAndHeadRetained: true,
      sourceOnlyChangesAfterApply: true,
      appliedArtifactBytesPreserved: true,
      localExportNoModel: requests.length === beforeLocalExport,
      reportsExported: manifest.reports.length === 7,
      globalProviderUnchanged: true,
    },
    failures,
    scope:
      'Actual isolated CLI prepare/model/budget/worktree, read-only native draft, explicit local approval, two native milestones and final review, explicit apply and full reports. Loopback model decisions only; not real-provider autonomy or paid validation.',
  };
  fs.writeFileSync(
    output.replace(/\.json$/, '') + '-output.txt',
    runs
      .map((run) => `${run.input}\n${run.stdout}\nSTDERR\n${run.stderr}`)
      .join('\n'),
  );
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        version: report.version,
        requests: requests.length,
        requestsBeforeApproval,
        checks: report.checks,
      },
      null,
      2,
    ),
  );
  assert.equal(report.passed, true);
  assert.ok(Object.values(report.checks).every(Boolean));
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        timedOut,
        error: error instanceof Error ? error.message : String(error),
        scratch,
        requests,
        failures,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  fs.writeFileSync(
    output.replace(/\.json$/, '') + '-output.txt',
    runs
      .map((run) => `${run.input}\n${run.stdout}\nSTDERR\n${run.stderr}`)
      .join('\n'),
  );
  clearTimeout(timer);
  server.close();
  server.closeAllConnections();
  if (worktree?.directory && fs.existsSync(worktree.directory)) {
    // Only this generated repository; retain the source on failure if Git cannot remove it.
    try {
      git(['worktree', 'remove', worktree.directory]);
    } catch {
      console.error(
        'Generated fixture worktree retained at',
        worktree.directory,
      );
    }
  }
}
