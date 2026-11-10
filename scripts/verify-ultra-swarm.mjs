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
const budgetMode = process.argv[4] === 'budget';
const recoveryMode = process.argv[4] === 'recovery';
let recoveryReady = false;
const diagnosticMode = process.argv[4] === 'diagnostic' || budgetMode;
const metadata = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(path.dirname(entry)), 'package.json'),
    'utf8',
  ),
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-native-swarm-'));
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
let swarmDirectory;
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
      assert.ok(!tools.includes('manage_swarm'));
      assert.ok(tools.includes('post_swarm_message'));
    }
    const call = (name, args) => ({
      content: '',
      tool_calls: [
        {
          index: 0,
          id: 'swarm_' + requests.length,
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
    if (recoveryMode && recoveryReady) {
      message = { content: 'SWARM_RECOVERY_CONTINUED' };
    } else if (role === 'main') {
      assert.ok(tools.includes('manage_swarm'));
      if (!swarmDirectory) {
        const temporaryRoot = path.join(profile, '.gemini/tmp');
        const projects = fs
          .readdirSync(temporaryRoot, { withFileTypes: true })
          .filter((item) => item.isDirectory());
        assert.equal(projects.length, 1);
        const swarmsRoot = path.join(temporaryRoot, projects[0].name, 'swarms');
        swarmDirectory = path.join(swarmsRoot, id);
        fs.mkdirSync(swarmDirectory, { recursive: true });
        fs.writeFileSync(path.join(swarmDirectory, 'board.jsonl'), '');
        fs.writeFileSync(
          path.join(swarmDirectory, 'members.json'),
          JSON.stringify({
            id,
            objective: 'Deliver answer=42 and independently verify it.',
            phase: 'active',
            revision: 0,
            ownerPid: child.pid,
            members: [],
            ...(budgetMode
              ? {
                  budget: {
                    maxRequests: 2,
                    maxFailedTurns: 2,
                    maxTurns: 10,
                    requests: 0,
                    failedTurns: 0,
                    turns: 0,
                  },
                }
              : {}),
          }),
        );
        fs.writeFileSync(
          path.join(swarmsRoot, 'latest.json'),
          JSON.stringify({ id }),
        );
        if (recoveryMode) {
          fs.writeFileSync(
            path.join(swarmDirectory, 'owner.json'),
            JSON.stringify({
              id,
              ownerPid: child.pid,
              budgetVersion: 1,
              accountingUnknown: false,
            }),
          );
          fs.writeFileSync(
            path.join(swarmDirectory, 'members.json'),
            '{broken-swarm-members',
          );
          fs.writeFileSync(
            path.join(swarmsRoot, 'latest.json'),
            '{broken-swarm-binding',
          );
        }
      }
      const steps = diagnosticMode
        ? [
            {
              action: 'add',
              name: 'author',
              agent: 'coder',
              brief:
                'Return the assigned result; this fixture verifies caught provider-limit diagnostics.',
            },
            { action: 'wait' },
          ]
        : [
            {
              action: 'add',
              name: 'analyst',
              agent: 'researcher',
              brief:
                'Read seed.txt only; report the required content publicly. Wait after the result.',
            },
            {
              action: 'add',
              name: 'builder',
              agent: 'coder',
              brief:
                'Own only deliverable.txt. Write answer=42 followed by a newline; preserve seed.txt. Report publicly.',
            },
            { action: 'wait' },
            {
              action: 'post',
              text: '@analyst independently recheck the seed, then wait.',
            },
            { action: 'wait' },
            {
              action: 'add',
              name: 'verifier',
              agent: 'workflow-auditor',
              brief:
                'Independently read deliverable.txt and verify the required content; no edits.',
            },
            { action: 'wait' },
            { action: 'finish' },
          ];
      if (results.length < steps.length)
        message = call('manage_swarm', {
          swarm_id: id,
          ...steps[results.length],
        });
      else {
        const saved = JSON.parse(
          fs.readFileSync(path.join(swarmDirectory, 'members.json'), 'utf8'),
        );
        if (diagnosticMode) {
          assert.equal(saved.phase, 'active');
          assert.equal(saved.members[0].state, 'paused');
          assert.ok(
            saved.members[0].result.includes(
              'OpenAI output token limit reached; response is incomplete.',
            ),
          );
          assert.ok(
            results.some((result) =>
              result.content.includes(
                'OpenAI output token limit reached; response is incomplete.',
              ),
            ),
          );
        } else assert.equal(saved.phase, 'completed');
        message = {
          content: diagnosticMode
            ? 'NATIVE_SWARM_DIAGNOSTIC_RETAINED'
            : 'NATIVE_SWARM_DELIVERED',
        };
      }
    } else if (diagnosticMode) {
      message = {
        content: '',
        reasoning_content: 'The configured output budget has been exhausted.',
      };
    } else if (role === 'researcher') {
      message =
        results.length === 0
          ? call('read_file', { file_path: source })
          : results.length === 1
            ? call('post_swarm_message', {
                text: '@coordinator Seed requires answer=42. Read-only investigation complete.',
              })
            : complete({
                response:
                  'Seed independently inspected. Required content is answer=42.',
              });
    } else if (role === 'coder') {
      message =
        results.length === 0
          ? call('write_file', { file_path: artifact, content: 'answer=42\n' })
          : results.length === 1
            ? call('post_swarm_message', {
                text: '@coordinator deliverable.txt written; ready for independent verification.',
              })
            : complete({
                response:
                  'Created the assigned artifact; no unrelated changes.',
              });
    } else {
      assert.ok(!tools.includes('write_file'));
      if (results.length === 0)
        message = call('read_file', { file_path: artifact });
      else {
        assert.ok(
          results.some((result) => result.content.includes('answer=42')),
        );
        message = complete({
          passed: true,
          summary:
            'Read the actual deliverable and matched the required content.',
          evidence: ['deliverable.txt: answer=42'],
        });
      }
    }
    const finishReason =
      diagnosticMode && role !== 'main'
        ? 'length'
        : message.tool_calls
          ? 'tool_calls'
          : 'stop';
    if (payload.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: message,
                finish_reason: finishReason,
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
              finish_reason: finishReason,
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
      'Coordinate the isolated native swarm and deliver its result.',
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
  if (recoveryMode && swarmDirectory) {
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
    };
    await runCommand(`/swarm cancel ${id}`);
    await runCommand('/swarm resume');
    recoveryReady = true;
    await runCommand(
      'Continue ordinary conversation after the cancelled swarm fixture.',
    );
    fs.appendFileSync(
      reportPath.replace(/\.json$/, '') + '-output.txt',
      '\nLOCAL RECOVERY\n' + JSON.stringify(recoveryRuns, null, 2),
    );
  }
  const state =
    swarmDirectory && fs.existsSync(path.join(swarmDirectory, 'members.json'))
      ? JSON.parse(
          fs.readFileSync(path.join(swarmDirectory, 'members.json'), 'utf8'),
        )
      : undefined;
  const board = swarmDirectory
    ? fs
        .readFileSync(path.join(swarmDirectory, 'board.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const owner =
    recoveryMode && swarmDirectory
      ? JSON.parse(
          fs.readFileSync(path.join(swarmDirectory, 'owner.json'), 'utf8'),
        )
      : undefined;
  const checks = recoveryMode
    ? {
        initialFailureBounded: exitCode === 1 && !timedOut,
        noFixtureMismatch: failures.length === 0,
        explicitLocalCancel:
          recoveryRuns[0]?.exitCode === 0 &&
          recoveryRuns[0]?.requestCount === 1,
        oldResumeRejected:
          recoveryRuns[1]?.exitCode === 42 &&
          recoveryRuns[1]?.requestCount === 1 &&
          recoveryRuns[1].output.includes(
            'Historical swarm usage is unavailable',
          ),
        cancelledWithUnknownUsage:
          state?.phase === 'cancelled' &&
          state.accountingUnknown === true &&
          owner?.accountingUnknown === true,
        membersPreserved:
          !!owner?.recoveryPath &&
          fs.readFileSync(owner.recoveryPath, 'utf8') ===
            '{broken-swarm-members',
        bindingPreserved:
          !!owner?.bindingRecoveryPath &&
          fs.readFileSync(owner.bindingRecoveryPath, 'utf8') ===
            '{broken-swarm-binding',
        originalBoardUnchanged: board.length === 0,
        ordinaryConversationRestored:
          recoveryRuns[2]?.exitCode === 0 &&
          recoveryRuns[2].output.includes('SWARM_RECOVERY_CONTINUED'),
        onlyExplicitConversationUsesModel:
          requests.length === 2 && recoveryRuns[2]?.requestCount === 2,
        noArtifact: !fs.existsSync(artifact),
      }
    : budgetMode
      ? {
          boundedExit: exitCode !== 0 && !timedOut,
          noFixtureMismatch: failures.length === 0,
          nativeBudgetBlock:
            state?.phase === 'blocked' &&
            state.stopReason.includes('model dispatch budget exhausted'),
          cumulativeDispatches: state?.budget?.requests === 2,
          noExtraProviderCall: requests.length === 3, // Initial coordinator response creates the isolated seed before accounting starts.
          singleMemberTurn:
            state?.members[0]?.turns === 1 &&
            state.members[0].state === 'paused',
          errorReported: (stdout + stderr).includes(
            'model dispatch budget exhausted',
          ),
          neverCompleted: !stdout.includes('NATIVE_SWARM_DELIVERED'),
        }
      : diagnosticMode
        ? {
            normalExit: exitCode === 0 && !timedOut,
            noFixtureMismatch: failures.length === 0,
            pausedWithConcreteDiagnostic:
              state?.members[0]?.state === 'paused' &&
              state.members[0].result.includes(
                'OpenAI output token limit reached; response is incomplete.',
              ),
            notMisreportedAsComplete: state?.phase === 'active',
            singlePausedTurn:
              requests.length === 4 && state?.members[0]?.turns === 1,
            finalText: stdout.includes('NATIVE_SWARM_DIAGNOSTIC_RETAINED'),
          }
        : {
            normalExit: exitCode === 0 && !timedOut,
            noFixtureMismatch: failures.length === 0,
            nativeCompletion: state?.phase === 'completed',
            exactDelivery:
              fs.existsSync(artifact) &&
              /^answer=42\r?\n$/.test(fs.readFileSync(artifact, 'utf8')),
            seedUnchanged:
              fs.readFileSync(source, 'utf8') ===
              'Required deliverable: answer=42\n',
            mentionsWakeIdleMember:
              state?.members.find((member) => member.name === 'analyst')
                ?.turns === 2,
            noIdlePolling: requests.length === 20,
            assignedPublicIdentity:
              board.some(
                (post) =>
                  post.sender === 'analyst' &&
                  post.text.startsWith('@coordinator'),
              ) &&
              board.some(
                (post) =>
                  post.sender === 'builder' &&
                  post.text.startsWith('@coordinator'),
              ),
            monotonicBoard: board.every(
              (post, index) => post.seq === index + 1,
            ),
            currentIndependentVerdict: state?.members.some(
              (member) =>
                member.agent === 'workflow-auditor' &&
                member.verifiedRevision === state.revision,
            ),
            finalText: stdout.includes('NATIVE_SWARM_DELIVERED'),
          };
  const report = {
    mode: recoveryMode
      ? 'recovery'
      : budgetMode
        ? 'budget'
        : diagnosticMode
          ? 'diagnostic'
          : 'delivery',
    passed: Object.values(checks).every(Boolean),
    version: metadata.version,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    elapsedMs: Date.now() - started,
    exitCode,
    timedOut,
    checks,
    requests,
    failures,
    state,
    board,
    ...(recoveryMode ? { owner, recoveryRuns } : {}),
    actualDeliveryHex: fs.existsSync(artifact)
      ? fs.readFileSync(artifact).toString('hex')
      : null,
    scope: recoveryMode
      ? 'Generated corrupt Swarm members and binding: initial bounded CLI failure, actual local /swarm cancel <id> with no model request, old resume rejected with exit 42 and no model request, then ordinary conversation restored. Both bad files retained byte for byte and board unchanged. Two loopback requests total; no real provider task or delivery success.'
      : budgetMode
        ? 'Native main/member executor budget with a loopback output-limit response: the initial coordinator request creates the isolated seed, then two cumulative dispatches are allowed and the next is blocked before the provider. CLI exits nonzero, member stays paused and the task stays blocked. Not a live-provider delivery or HTTP retry billing counter.'
        : diagnosticMode
          ? 'Installed CLI and real local executor receiving a loopback provider output-limit response. Checks the concrete error reaches the paused member, board and coordinator, without marking completion. Not a live-provider task or proof the model respects retry budgets.'
          : 'Installed CLI, actual native swarm service, real local child executors, public board and member identity, mention-triggered wake, actual file writes/reads and current independent verifier gate. Model responses are loopback fixtures. Not live-provider autonomy, terminal keyboard/visual acceptance or complex reverse engineering.',
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
  assert.match(path.basename(scratch), /^ultra-native-swarm-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
