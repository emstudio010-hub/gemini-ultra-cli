import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const entry = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3]);
const metadata = JSON.parse(
  fs.readFileSync(path.join(path.dirname(entry), '../package.json'), 'utf8'),
);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-snapshot-contract-'),
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const ack = 'ACK_WITHOUT_SNAPSHOT_DO_NOT_KEEP';
let current, child;
const scenarios = [];
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const utility = payload.stream !== true;
    current.requests.push({
      kind: utility ? 'summary' : 'main',
      model: payload.model,
    });
    let message;
    if (utility) {
      current.summaryRequests++;
      assert.ok(
        current.summaryRequests <= 2,
        'Failed automatic summaries must not repeat.',
      );
      message = {
        content:
          current.summaryRequests === 1
            ? current.mode === 'fallback'
              ? `<scratchpad>PRIVATE_REASONING_DO_NOT_KEEP</scratchpad>\n${current.snapshot}\nReview commentary`
              : '<state_snapshot>INCOMPLETE_OMITS_CONSTRAINTS</state_snapshot>'
            : ack,
      };
    } else {
      current.mainRequests++;
      const call = (file, id) => ({
        tool_calls: [
          {
            index: 0,
            id,
            type: 'function',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ file_path: file }),
            },
          },
        ],
      });
      if (current.mainRequests === 1)
        message = call(current.older, 'older_read');
      else if (current.mainRequests === 2)
        message = call(current.recent, 'recent_read');
      else if (current.mode === 'invalid' && current.mainRequests === 3)
        message = call(current.recent, 'repeat_read');
      else {
        assert.equal(current.mainRequests, current.mode === 'fallback' ? 3 : 4);
        current.finalMessages = payload.messages;
        message = { content: 'SNAPSHOT_CONTRACT_CONTINUED' };
      }
    }
    const inflatedUsage =
      !utility &&
      (current.mainRequests === 2 ||
        (current.mode === 'invalid' && current.mainRequests === 3));
    const usage = {
      prompt_tokens: inflatedUsage ? 70000 : 1000,
      completion_tokens: 10,
      total_tokens: inflatedUsage ? 70010 : 1010,
    };
    res.writeHead(200, {
      'Content-Type': payload.stream ? 'text/event-stream' : 'application/json',
    });
    res.end(
      payload.stream
        ? 'data: ' +
            JSON.stringify({
              choices: [
                {
                  delta: message,
                  finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
                },
              ],
            }) +
            '\n\ndata: ' +
            JSON.stringify({ choices: [], usage }) +
            '\n\ndata: [DONE]\n\n'
        : JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', ...message },
                finish_reason: 'stop',
              },
            ],
            usage,
          }),
    );
  } catch (error) {
    current.failures.push(error.stack || String(error));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'Snapshot contract fixture mismatch' },
      }),
    );
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  for (const mode of ['fallback', 'invalid']) {
    const home = path.join(scratch, mode, 'home');
    const workspace = path.join(scratch, mode, 'workspace');
    fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
    fs.mkdirSync(workspace);
    const older = path.join(workspace, 'older.txt'),
      recent = path.join(workspace, 'recent.txt');
    fs.writeFileSync(
      older,
      'OLDER_ORIGINAL_EVIDENCE ' + 'read-only audit evidence\n'.repeat(1500),
    );
    fs.writeFileSync(recent, 'RECENT_EVIDENCE_MUST_STAY');
    const before = [older, recent].map((file) => hash(fs.readFileSync(file)));
    const snapshot = `<state_snapshot>
<overall_goal>Continue the generated local investigation</overall_goal>
<active_constraints>SCOPE_ANCHOR: only generated files; do not modify them</active_constraints>
<key_knowledge>Evidence path: ${older}</key_knowledge>
<artifact_trail>Read the earlier evidence</artifact_trail>
<file_system_state>Both original files are unchanged</file_system_state>
<recent_actions>Read completed</recent_actions>
<task_state>Review is pending; continue with the latest evidence</task_state>
</state_snapshot>`;
    current = {
      mode,
      older,
      recent,
      snapshot,
      requests: [],
      summaryRequests: 0,
      mainRequests: 0,
      failures: [],
      finalMessages: [],
    };
    const providers = path.join(scratch, mode, 'providers.json');
    fs.writeFileSync(
      providers,
      JSON.stringify({
        version: 1,
        activeProviderId: 'fixture',
        activeModel: 'snapshot-fixture',
        reasoningEffort: 'low',
        providers: [
          {
            id: 'fixture',
            name: 'Fixture',
            protocol: 'openai-chat',
            baseUrl: `http://127.0.0.1:${server.address().port}`,
            apiKey: '',
            models: ['snapshot-fixture'],
            defaultModel: 'snapshot-fixture',
            contextWindow: 128000,
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(home, '.gemini/settings.json'),
      JSON.stringify({
        security: { auth: { selectedType: 'gateway' } },
        privacy: { usageStatisticsEnabled: false },
        general: {
          enableAutoUpdate: false,
          enableAutoUpdateNotification: false,
          maxAttempts: 1,
        },
        model: { maxSessionTurns: 6 },
        tools: { core: ['read_file'], useRipgrep: false },
      }),
    );
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (
        /^(?:http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/i.test(
          key,
        )
      )
        delete env[key];
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      GEMINI_CLI_HOME: home,
      GEMINI_CLI_NO_RELAUNCH: '1',
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
      GEMINI_ULTRA_PROVIDERS_FILE: providers,
      GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, mode, 'runtime.json'),
      GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, mode, 'prompts.json'),
      GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, mode, 'locale.json'),
      GEMINI_DRILL_DIR: path.join(scratch, mode, 'drill'),
      GEMINI_DRILL_DB: path.join(scratch, mode, 'drill.sqlite'),
      GEMINI_ULTRA_USAGE_LOG: path.join(scratch, mode, 'usage.jsonl'),
      NO_PROXY: '*',
      NO_COLOR: '1',
      TERM: 'dumb',
      GEMINI_PTY_INFO: 'child_process',
    });
    fs.writeFileSync(
      env.GEMINI_ULTRA_RUNTIME_FILE,
      JSON.stringify({
        collaboration: 'single',
        maxParallel: 1,
        workflow: 'general',
      }),
    );
    fs.writeFileSync(
      env.GEMINI_ULTRA_PROMPTS_FILE,
      JSON.stringify({ enabled: false, prompt: '', rules: [] }),
    );
    fs.writeFileSync(
      env.GEMINI_ULTRA_LOCALE_FILE,
      JSON.stringify({ locale: 'en' }),
    );
    const originalPrompt =
      'ORIGINAL_SCOPE_MARKER: inspect only the two generated files, preserve their contents and continue until the current local investigation is complete.';
    let stdout = '',
      stderr = '',
      timedOut = false;
    child = spawn(
      process.execPath,
      [
        entry,
        '-m',
        'snapshot-fixture',
        '-p',
        originalPrompt,
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
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 45000);
    let exitCode;
    try {
      exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
    } finally {
      clearTimeout(timer);
    }
    const context = JSON.stringify(current.finalMessages);
    const calls = current.finalMessages.flatMap(
      (message) => message.tool_calls || [],
    );
    const ids = new Set(calls.map((call) => call.id));
    const toolResults = current.finalMessages.filter(
      (message) => message.role === 'tool',
    );
    const checks = {
      normalExit:
        exitCode === 0 &&
        !timedOut &&
        stdout.includes('SNAPSHOT_CONTRACT_CONTINUED'),
      noFixtureMismatch: current.failures.length === 0,
      twoSummaryRequestsOnly: current.summaryRequests === 2,
      expectedMainRequests:
        current.mainRequests === (mode === 'fallback' ? 3 : 4),
      noAcknowledgementOrScratchpadInContext:
        !context.includes(ack) &&
        !context.includes('PRIVATE_REASONING_DO_NOT_KEEP'),
      recentEvidencePreserved: context.includes('RECENT_EVIDENCE_MUST_STAY'),
      completeToolPairs:
        toolResults.length > 0 &&
        toolResults.every((result) => ids.has(result.tool_call_id)),
      originalFilesUnchanged: [older, recent].every(
        (file, index) => hash(fs.readFileSync(file)) === before[index],
      ),
      correctHistory:
        mode === 'fallback'
          ? current.finalMessages.some(
              (message) =>
                message.role === 'user' &&
                (typeof message.content === 'string'
                  ? message.content.includes(snapshot)
                  : message.content?.some((part) =>
                      part.text?.includes(snapshot),
                    )),
            ) && !context.includes('OLDER_ORIGINAL_EVIDENCE')
          : context.includes(originalPrompt) &&
            context.includes('OLDER_ORIGINAL_EVIDENCE') &&
            !context.includes('INCOMPLETE_OMITS_CONSTRAINTS'),
    };
    const prefix = reportPath.replace(/\.json$/, '') + '-' + mode;
    fs.writeFileSync(
      prefix + '-context.json',
      JSON.stringify(current.finalMessages, null, 2),
    );
    fs.writeFileSync(prefix + '-output.txt', stdout + '\nSTDERR\n' + stderr);
    scenarios.push({
      mode,
      exitCode,
      timedOut,
      mainRequests: current.mainRequests,
      summaryRequests: current.summaryRequests,
      requests: current.requests,
      failures: current.failures,
      checks,
      passed: Object.values(checks).every(Boolean),
    });
  }
  const report = {
    passed: scenarios.every((scenario) => scenario.passed),
    version: metadata.version,
    platform: process.platform,
    scenarios,
    scope:
      'Actual installed CLI and native automatic compression, isolated loopback model. Reported usage triggers compression without a long paid prompt. Checks snapshot fallback, rejected output retaining original history, no automatic summary retry, real file reads and tool pairs. Does not prove live-model semantic completeness.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  child?.kill();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-snapshot-contract-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
