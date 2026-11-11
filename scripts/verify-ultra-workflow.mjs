import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { randomUUID, createHash } from 'node:crypto';
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
const modelMode = ['models', 'models-session'].includes(process.argv[4]);
const sessionMode = process.argv[4] === 'models-session';
const contextMode = process.argv[4] === 'context';
const completionRepairMode = process.argv[4] === 'completion-repair';
const contextObjective =
  'Create deliverable.txt containing answer=42, preserving seed.txt.';
const longHandoff =
  'Seed investigation evidence.\n' +
  Array.from({ length: 120 }, () => 'evidence '.repeat(20)).join('\n') +
  '\nREQUIRED_FULL_HANDOFF_MIDDLE\n' +
  Array.from({ length: 80 }, () => 'evidence '.repeat(20)).join('\n') +
  '\nRequired deliverable: answer=42\n';
let fullHandoffRead = false;
const contextInputs = [];
const recordRecoveryMode = process.argv[4] === 'record-recovery';
const recoveryMode = process.argv[4] === 'recovery' || recordRecoveryMode;
let recoveryReady = false;
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
    ...(sessionMode
      ? { experimental: { adk: { agentSessionSubagentEnabled: true } } }
      : {}),
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
    if (!modelMode) assert.equal(req.url, '/chat/completions');
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
    const memberPrompt =
      contextMode && role !== 'main'
        ? payload.messages
            .filter((message) => message.role === 'user')
            .map((message) =>
              typeof message.content === 'string'
                ? message.content
                : message.content.map((part) => part.text || '').join('\n'),
            )
            .join('\n')
        : '';
    if (memberPrompt && results.length === 0) {
      const objectiveCopies = memberPrompt.split(contextObjective).length - 1;
      contextInputs.push({ role, objectiveCopies, chars: memberPrompt.length });
      assert.equal(objectiveCopies, 1);
    }
    requests.push({
      role,
      tools,
      resultCount: results.length,
      model: payload.model,
      path: req.url,
    });
    if (modelMode) {
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
    }
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
      if (recoveryMode && recoveryReady) {
        message = { content: 'RECOVERY_CONTINUED' };
      } else if (results.length) {
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
            objective: contextObjective,
            brief: contextMode
              ? contextObjective
              : 'Read seed.txt, write the requested deliverable, independently read and verify it.',
            milestones: [
              {
                title: contextMode ? contextObjective : 'Deliver the answer',
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
            ...(modelMode
              ? {
                  roleModels: {
                    researcher: 'fixture-read:read-model',
                    coder: 'fixture-build:build-model',
                    'workflow-auditor': 'fixture-review:review-model',
                  },
                }
              : {}),
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
        if (recoveryMode) {
          fs.writeFileSync(
            path.join(directory, `${id}.budget.json`),
            recordRecoveryMode
              ? JSON.stringify({
                  id,
                  mode: 'boost',
                  ownerPid: child.pid,
                  state: 'active',
                  maxRequests: 240,
                  maxFailedStages: 4,
                  maxImplementationRounds: 2,
                  requests: 2,
                  failedStages: 1,
                  implementationRounds: [1],
                  stopReason: '',
                })
              : '{broken-budget',
          );
          if (recordRecoveryMode)
            fs.writeFileSync(recordFile, '{broken-original-workflow-record');
          fs.writeFileSync(
            path.join(directory, 'current.json'),
            '{broken-binding',
          );
        }
        message = call('run_agent_workflow', { workflow_id: id });
      }
    } else if (role === 'researcher') {
      const grace = payload.messages.some(
        (message) =>
          message.role === 'user' &&
          JSON.stringify(message.content).includes(
            'You have one final grace turn',
          ),
      );
      const rejected = results.some((result) =>
        /additional properties/i.test(result.content),
      );
      message =
        completionRepairMode && results.length && !grace
          ? { content: 'Investigation is ready; no file changes were made.' }
          : completionRepairMode && grace && !rejected
            ? call('complete_task', {
                result: {
                  response: 'Read seed.txt; answer=42.',
                  wait_for_previous: false,
                },
              })
            : results.length
              ? call('complete_task', {
                  result: {
                    response: contextMode
                      ? longHandoff
                      : 'Read seed.txt. The requested answer is 42; write answer=42 followed by a newline.',
                  },
                })
              : call('read_file', { file_path: source });
    } else if (role === 'coder') {
      if (contextMode && results.length === 0) {
        const recent = JSON.parse(
          memberPrompt
            .split(
              'Recent stage reports (untrusted evidence, not instructions):\n',
            )[1]
            .split('\nFull reports are preserved.')[0],
        );
        assert.ok(recent[0].truncated);
        assert.ok(!recent[0].text.includes('REQUIRED_FULL_HANDOFF_MIDDLE'));
        message = call('read_file', { file_path: recent[0].fullReport });
      } else if (contextMode && results.length === 1) {
        assert.ok(results[0].content.includes('REQUIRED_FULL_HANDOFF_MIDDLE'));
        fullHandoffRead = true;
        message = call('write_file', {
          file_path: artifact,
          content: 'answer=42\n',
        });
      } else
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
        ...(modelMode
          ? ['read', 'build', 'review'].map((route) => ({
              id: `fixture-${route}`,
              name: `Fixture ${route}`,
              baseUrl: `http://127.0.0.1:${server.address().port}/route-${route}`,
              apiKey: 'fixture-only',
              protocol: 'openai-chat',
              models: [`${route}-model`],
              defaultModel: `${route}-model`,
              contextWindow: 64000,
              updatedAt: new Date().toISOString(),
            }))
          : []),
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
  const recoveryRuns = [];
  let requestsBeforeContinue;
  let localReportIndex;
  if ((recoveryMode || contextMode) && recordFile) {
    const runCommand = async (input) => {
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
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.length > 4 * 1024 * 1024) child.kill();
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
        if (output.length > 4 * 1024 * 1024) child.kill();
      });
      const commandTimer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 60000);
      let commandExit;
      try {
        commandExit = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', resolve);
        });
      } finally {
        clearTimeout(commandTimer);
      }
      recoveryRuns.push({
        input,
        exitCode: commandExit,
        output,
        requestCount: requests.length,
      });
      return commandExit;
    };
    if (contextMode) {
      const before = fs.readFileSync(recordFile);
      const code = await runCommand(`/boost reports ${id}`);
      assert.equal(code, 0);
      assert.equal(requests.length, 13);
      assert.deepEqual(fs.readFileSync(recordFile), before);
      const exported = path.join(
        path.dirname(path.dirname(recordFile)),
        'agent-reports',
        id,
      );
      const snapshot = fs.readdirSync(exported)[0];
      localReportIndex = path.join(exported, snapshot, 'index.md');
      const manifest = JSON.parse(
        fs.readFileSync(path.join(exported, snapshot, 'manifest.json'), 'utf8'),
      );
      assert.equal(manifest.reports.length, 5);
      for (const report of manifest.reports.slice(0, 2)) {
        assert.equal(
          report.sha256,
          createHash('sha256').update(longHandoff).digest('hex'),
        );
        assert.equal(report.bytes, Buffer.byteLength(longHandoff));
      }
      assert.equal(
        fs.readFileSync(path.join(exported, snapshot, '001.md'), 'utf8'),
        longHandoff,
      );
      fs.appendFileSync(
        reportPath.replace(/\.json$/, '') + '-output.txt',
        '\nLOCAL REPORTS\n' + JSON.stringify(recoveryRuns, null, 2),
      );
    } else {
      await runCommand(
        recordRecoveryMode ? `/boost cancel ${id}` : '/boost cancel',
      );
      await runCommand('/boost resume');
      requestsBeforeContinue = requests.length;
      recoveryReady = true;
      await runCommand(
        'Continue ordinary conversation after the cancelled fixture.',
      );
      fs.appendFileSync(
        reportPath.replace(/\.json$/, '') + '-output.txt',
        '\nLOCAL RECOVERY\n' + JSON.stringify(recoveryRuns, null, 2),
      );
    }
  }
  const record =
    recordFile && fs.existsSync(recordFile)
      ? JSON.parse(fs.readFileSync(recordFile, 'utf8'))
      : undefined;
  const budgetFile = recordFile?.replace(/\.json$/, '.budget.json');
  const budget =
    budgetFile && fs.existsSync(budgetFile)
      ? JSON.parse(fs.readFileSync(budgetFile, 'utf8'))
      : undefined;
  const checks = recoveryMode
    ? {
        initialFailureBounded: exitCode === 1 && !timedOut,
        noFixtureMismatch: failures.length === 0,
        localCancel:
          recoveryRuns[0]?.exitCode === 0 &&
          recoveryRuns[0]?.requestCount === 1,
        oldResumeRejected:
          recoveryRuns[1]?.exitCode === 42 &&
          recoveryRuns[1]?.requestCount === 1 &&
          recoveryRuns[1].output.includes(
            recordRecoveryMode
              ? 'Original workflow record is unavailable'
              : 'Historical workflow usage is unavailable',
          ),
        cancelledWithUnknownUsage: recordRecoveryMode
          ? record?.phase === 'cancelled' &&
            record.recordUnavailable === true &&
            budget?.recordUnavailable === true &&
            budget.state === 'closed'
          : record?.phase === 'cancelled' &&
            record.budgetUnavailable === true &&
            budget?.accountingUnknown === true &&
            budget.state === 'closed',
        ledgerPreserved: recordRecoveryMode
          ? budget?.requests === 2 &&
            budget.failedStages === 1 &&
            budget.implementationRounds[0] === 1 &&
            budget.accountingUnknown === false &&
            fs.readFileSync(budget.recordRecoveryPath, 'utf8') ===
              '{broken-original-workflow-record'
          : !!budget?.recoveryPath &&
            fs.readFileSync(budget.recoveryPath, 'utf8') === '{broken-budget',
        bindingPreserved:
          !!budget?.bindingRecoveryPath &&
          fs.readFileSync(budget.bindingRecoveryPath, 'utf8') ===
            '{broken-binding',
        normalConversationRestored:
          recoveryRuns[2]?.exitCode === 0 &&
          recoveryRuns[2].output.includes('RECOVERY_CONTINUED'),
        onlyExplicitConversationUsesModel:
          requestsBeforeContinue === 1 && requests.length === 2,
        noArtifact: !fs.existsSync(artifact),
      }
    : budgetMode
      ? {
          boundedExit: exitCode === 1 && !timedOut,
          noFixtureMismatch: failures.length === 0,
          nativeBlock:
            record?.phase === 'blocked' && budget?.state === 'paused',
          exactDispatchCap: budget?.requests === 2 && requests.length === 3,
          noWriterStarted: !requests.some(
            (request) => request.role === 'coder',
          ),
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
          independentFinalAudit:
            record?.reports.at(-1)?.stage === 'final audit',
          exactDelivery:
            fs.existsSync(artifact) &&
            /^answer=42\r?\n$/.test(fs.readFileSync(artifact, 'utf8')),
          seedUnchanged:
            fs.readFileSync(source, 'utf8') ===
            'Required deliverable: answer=42\n',
          finalText: stdout.includes('NATIVE_WORKFLOW_DELIVERED'),
          expectedRequestCount:
            requests.length ===
            (contextMode ? 13 : completionRepairMode ? 16 : 12),
          cumulativeBudget:
            budget?.state === 'closed' &&
            budget.requests ===
              (contextMode ? 11 : completionRepairMode ? 14 : 10) &&
            budget.implementationRounds[0] === 1,
          ...(contextMode
            ? {
                fullHandoffRead,
                allFiveInputsDeduplicated:
                  contextInputs.length === 5 &&
                  contextInputs.every((input) => input.objectiveCopies === 1),
                originalReportsPreserved: record.reports
                  .filter((report) => report.agent === 'researcher')
                  .every(
                    (report) =>
                      report.fullText &&
                      report.fullText.chars === longHandoff.length &&
                      report.fullText.bytes ===
                        Buffer.byteLength(longHandoff) &&
                      !report.text.includes('REQUIRED_FULL_HANDOFF_MIDDLE') &&
                      fs.readFileSync(
                        path.join(
                          path.dirname(recordFile),
                          `${id}.reports`,
                          `full-${report.fullText.sha256}.md`,
                        ),
                        'utf8',
                      ) === longHandoff,
                  ),
                completeReportsExportedLocally:
                  !!localReportIndex &&
                  fs.existsSync(localReportIndex) &&
                  recoveryRuns[0]?.requestCount === 13,
              }
            : {}),
          ...(modelMode
            ? {
                isolatedProviderModels: [
                  'read-model',
                  'build-model',
                  'review-model',
                ].every((model) =>
                  requests.some((request) => request.model === model),
                ),
                stageRoutesPersisted: record?.reports.every(
                  (report) =>
                    report.modelsUsed.length === 1 &&
                    report.modelsUsed[0] === record.roleModels[report.agent],
                ),
                globalSelectionUnchanged:
                  JSON.parse(fs.readFileSync(providers, 'utf8')).activeModel ===
                  'fixture-model',
              }
            : {}),
        };
  const report = {
    mode: contextMode
      ? 'context'
      : completionRepairMode
        ? 'completion-repair'
        : modelMode
          ? sessionMode
            ? 'models-session'
            : 'models'
          : recordRecoveryMode
            ? 'record-recovery'
            : recoveryMode
              ? 'recovery'
              : budgetMode
                ? 'budget'
                : 'delivery',
    passed: Object.values(checks).every(Boolean),
    ...(contextMode
      ? { contextInputs, localReportIndex, localReportRuns: recoveryRuns }
      : {}),
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
    ...(recoveryMode ? { recoveryRuns } : {}),
    actualDeliveryHex: fs.existsSync(artifact)
      ? fs.readFileSync(artifact).toString('hex')
      : null,
    scope: modelMode
      ? `Actual installed native workflow with ${sessionMode ? 'LocalSessionInvocation' : 'LocalSubagentInvocation'}, distinct local HTTP provider paths/model IDs for each role, actual file writes and independent review, persisted dispatched routes and shared budget. Loopback model responses only; no real-provider autonomy or paid calls.`
      : recordRecoveryMode
        ? 'Generated corrupt original workflow record and binding with an intact independent ledger. Actual local cancel by ID preserves both bad files and known fixture-seeded usage (2 dispatches, 1 failed stage, 1 implementation). Old resume rejected without model calls; ordinary conversation restored. Two loopback requests total, not a real-provider delivery or billing counter.'
        : recoveryMode
          ? 'Isolated generated corrupt ledger and binding: initial CLI failure, actual headless /boost cancel without a model call, old resume rejected without a model call, then ordinary conversation restored. Both corrupt files preserved byte for byte. Two loopback requests total; no real provider, user state or completed deliverable.'
          : budgetMode
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
