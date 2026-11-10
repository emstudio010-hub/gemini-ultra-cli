import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const entry = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3]);
const metadata = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(path.dirname(entry)), 'package.json'),
    'utf8',
  ),
);
const budgetMode = process.argv[4] === 'budget';
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-native-workflow-'),
);
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const source = path.join(workspace, 'seed.txt');
const artifact = path.join(workspace, 'deliverable.txt');
fs.writeFileSync(source, 'Required deliverable: answer=42\n');
fs.writeFileSync(
  path.join(profile, '.gemini/settings.json'),
  JSON.stringify({
    security: { auth: { selectedType: 'gateway' } },
    privacy: { usageStatisticsEnabled: false },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
  }),
);
const id = randomUUID();
const requests = [];
const failures = [];
let recordFile;
let child;
let timer;
let timedOut = false;
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.url, '/chat/completions');
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
    const tools = payload.tools.map((tool) => tool.function.name);
    const results = payload.messages.filter(
      (message) => message.role === 'tool',
    );
    requests.push({ role, tools, resultCount: results.length });
    if (role !== 'main') {
      assert.ok(!tools.includes('run_agent_workflow'));
      assert.ok(!tools.includes('draft_agent_workflow'));
    }
    const call = (name, args) => ({
      content: '',
      tool_calls: [
        {
          index: 0,
          id: 'workflow_' + requests.length,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    let message;
    if (role === 'main') {
      if (results.length) {
        assert.ok(
          results.some(
            (result) =>
              result.content.includes('completed') &&
              result.content.includes(id),
          ),
          'Native workflow was not completed',
        );
        message = { content: 'NATIVE_WORKFLOW_DELIVERED' };
      } else {
        assert.ok(tools.includes('run_agent_workflow'));
        assert.ok(tools.includes('draft_agent_workflow'));
        const temporaryRoot = path.join(profile, '.gemini/tmp');
        const projects = fs
          .readdirSync(temporaryRoot, { withFileTypes: true })
          .filter((item) => item.isDirectory());
        assert.equal(
          projects.length,
          1,
          'Expected exactly one isolated project',
        );
        const directory = path.join(
          temporaryRoot,
          projects[0].name,
          'agent-workflows',
        );
        fs.mkdirSync(directory, { recursive: true });
        recordFile = path.join(directory, id + '.json');
        fs.writeFileSync(
          recordFile,
          JSON.stringify({
            id,
            mode: 'boost',
            objective:
              'Create deliverable.txt containing answer=42, preserving seed.txt.',
            brief:
              'Read seed.txt, write the requested deliverable, independently read and verify it.',
            milestones: [
              {
                title: 'Deliver the answer',
                acceptance:
                  'deliverable.txt contains exactly answer=42 followed by newline.',
                completed: false,
              },
            ],
            previousApprovalMode: 'yolo',
            phase: 'ready',
            approved: true,
            updatedAt: new Date().toISOString(),
            stage: '',
            reports: [],
          }),
        );
        if (budgetMode) {
          fs.writeFileSync(
            path.join(directory, `${id}.budget.json`),
            JSON.stringify({
              id,
              mode: 'boost',
              ownerPid: child.pid,
              state: 'active',
              maxRequests: 2,
              maxFailedStages: 4,
              maxImplementationRounds: 2,
              requests: 0,
              failedStages: 0,
              implementationRounds: [0],
              stopReason: '',
            }),
          );
          fs.writeFileSync(
            path.join(directory, 'current.json'),
            JSON.stringify({ id }),
          );
        }
        message = call('run_agent_workflow', { workflow_id: id });
      }
    } else if (role === 'researcher') {
      message = results.length
        ? call('complete_task', {
            result: {
              response:
                'Read seed.txt. The requested answer is 42; write answer=42 followed by a newline.',
            },
          })
        : call('read_file', { file_path: source });
    } else if (role === 'coder') {
      message = results.length
        ? call('complete_task', {
            result: {
              response:
                'Created deliverable.txt from the seed requirements. No unrelated files or checks.',
            },
          })
        : call('write_file', { file_path: artifact, content: 'answer=42\n' });
    } else {
      assert.ok(!tools.includes('write_file'));
      assert.ok(!tools.includes('run_shell_command'));
      if (results.length) {
        assert.ok(
          results.some((result) => result.content.includes('answer=42')),
        );
        const completion = payload.tools.find(
          (tool) => tool.function.name === 'complete_task',
        ).function;
        assert.ok(
          completion.parameters.properties.verdict.properties.passed,
          'Auditor lost its own verdict schema',
        );
        message = call('complete_task', {
          verdict: {
            passed: true,
            summary:
              'Independently read the actual artifact and matched the required content.',
            evidence: [
              'deliverable.txt: answer=42',
              'seed.txt: required answer=42',
            ],
          },
        });
      } else message = call('read_file', { file_path: artifact });
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
    res.end(
      JSON.stringify({
        error: { message: 'Workflow fixture mismatch: ' + failures.at(-1) },
      }),
    );
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'fixture-model',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'fixture',
          name: 'Fixture',
          baseUrl: 'http://127.0.0.1:' + server.address().port,
          apiKey: 'fixture-only',
          protocol: 'openai-chat',
          models: ['fixture-model'],
          defaultModel: 'fixture-model',
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
    NO_COLOR: '1',
    NO_PROXY: '*',
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
  const started = Date.now();
  child = spawn(
    process.execPath,
    [
      entry,
      '-y',
      '-m',
      'fixture-model',
      '-p',
      'Execute the isolated native workflow and return the deliverable.',
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
  fs.writeFileSync(
    reportPath.replace(/\.json$/, '') + '-output.txt',
    stdout + '\nSTDERR\n' + stderr,
  );
  const record =
    recordFile && fs.existsSync(recordFile)
      ? JSON.parse(fs.readFileSync(recordFile, 'utf8'))
      : undefined;
  const budgetFile = recordFile?.replace(/\.json$/, '.budget.json');
  const budget =
    budgetFile && fs.existsSync(budgetFile)
      ? JSON.parse(fs.readFileSync(budgetFile, 'utf8'))
      : undefined;
  const checks = budgetMode
    ? {
        boundedExit: exitCode === 1 && !timedOut,
        noFixtureMismatch: failures.length === 0,
        nativeBlock: record?.phase === 'blocked' && budget?.state === 'paused',
        exactDispatchCap: budget?.requests === 2 && requests.length === 3,
        noWriterStarted: !requests.some((request) => request.role === 'coder'),
        noArtifact: !fs.existsSync(artifact),
        errorRetained:
          record?.stage.includes('model dispatch budget exhausted') &&
          (stdout + stderr).includes('model dispatch budget exhausted'),
        partialReportsRetained:
          record?.reports.length > 0 &&
          record.reports.every((report) =>
            report.text.includes('model dispatch budget exhausted'),
          ),
      }
    : {
        normalExit: exitCode === 0 && !timedOut,
        noFixtureMismatch: failures.length === 0,
        nativeCompletion:
          record?.phase === 'completed' &&
          record.milestones.every((item) => item.completed),
        allFiveStages:
          record?.reports.length === 5 &&
          record.reports.every((item) => item.completed),
        independentFinalAudit: record?.reports.at(-1)?.stage === 'final audit',
        exactDelivery:
          fs.existsSync(artifact) &&
          /^answer=42\r?\n$/.test(fs.readFileSync(artifact, 'utf8')),
        seedUnchanged:
          fs.readFileSync(source, 'utf8') ===
          'Required deliverable: answer=42\n',
        finalText: stdout.includes('NATIVE_WORKFLOW_DELIVERED'),
        twelveRequests: requests.length === 12,
        cumulativeBudget:
          budget?.state === 'closed' &&
          budget.requests === 10 &&
          budget.implementationRounds[0] === 1,
      };
  const report = {
    mode: budgetMode ? 'budget' : 'delivery',
    passed: Object.values(checks).every(Boolean),
    version: metadata.version,
    platform: process.platform,
    node: process.version,
    elapsedMs: Date.now() - started,
    exitCode,
    timedOut,
    checks,
    requests,
    failures,
    workflow: record,
    budget,
    actualDeliveryHex: fs.existsSync(artifact)
      ? fs.readFileSync(artifact).toString('hex')
      : null,
    scope: budgetMode
      ? 'Actual native workflow and child executors stop at two cumulative model dispatches; one initial coordinator request seeds the isolated state before accounting starts. Partial evidence remains blocked, no writer starts, CLI exits 1 without observer termination. Loopback fixture, not a paid provider task or delivery success.'
      : 'Actual installed CLI and native workflow tool, real child executors, isolated HTTP model fixture. Two read-only researchers, one writer, milestone auditor and final auditor; actual file read/write and persisted stages. Not live-provider autonomy, UI keyboard interaction, deep reverse-engineering or production acceptance.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child?.kill();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-native-workflow-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
