import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const entry = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3]);
const output = path.dirname(reportPath);
fs.mkdirSync(output, { recursive: true });
const label = path.basename(reportPath).replace(/\.json$/, '');
const r2 = path.resolve(process.argv[4]);
const metadata = JSON.parse(
  fs.readFileSync(path.join(path.dirname(entry), '../package.json'), 'utf8'),
);
const packageSha256 = process.env.ULTRA_VERIFIED_PACKAGE_SHA;
const sourceCommit = process.env.ULTRA_VERIFIED_SOURCE_COMMIT;
assert.match(label, /^[a-zA-Z0-9._-]+$/);
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-binary-analysis-'),
);
const home = path.join(scratch, 'home'),
  workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const sample = path.join(workspace, 'literal & sample.elf');
const bytes = Buffer.alloc(256);
bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
bytes.writeUInt16LE(2, 16);
bytes.writeUInt16LE(62, 18);
bytes.writeUInt32LE(1, 20);
bytes.writeBigUInt64LE(0x400080n, 24);
bytes.writeBigUInt64LE(64n, 32);
bytes.writeUInt16LE(64, 52);
bytes.writeUInt16LE(56, 54);
bytes.writeUInt16LE(1, 56);
bytes.writeUInt32LE(1, 64);
bytes.writeUInt32LE(5, 68);
bytes.writeBigUInt64LE(0x400000n, 80);
bytes.writeBigUInt64LE(0x400000n, 88);
bytes.writeBigUInt64LE(256n, 96);
bytes.writeBigUInt64LE(256n, 104);
bytes.writeBigUInt64LE(4096n, 112);
bytes.set([0xe8, 11, 0, 0, 0, 0xc3], 128);
bytes.set([0xb8, 42, 0, 0, 0, 0xc3], 144);
fs.writeFileSync(sample, bytes);
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sampleHash = hash(sample),
  requests = [],
  failures = [];
let child,
  timer,
  timedOut = false;
const decode = (value) => {
  for (let i = 0; i < 4; i++) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return value;
      }
    } else if (value && typeof value === 'object' && 'output' in value)
      value = value.output;
    else return value;
  }
  return value;
};
const frame = (value) => 'data: ' + JSON.stringify(value) + '\n\n';
const server = createServer(async (req, res) => {
  try {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    const payload = JSON.parse(Buffer.concat(parts).toString());
    assert.ok(
      payload.tools.some((tool) => tool.function?.name === 'binary_analyze'),
    );
    const results = payload.messages
      .filter((message) => message.role === 'tool')
      .map((message) => decode(message.content));
    const index = requests.length;
    requests.push({ index, toolResults: results.length });
    const call = (name, args) => ({
      tool_calls: [
        {
          index: 0,
          id: 'native_' + index,
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    let delta;
    if (index === 0)
      delta = call('binary_analyze', { filePath: sample, view: 'functions' });
    else if (index === 1) {
      assert.ok(
        results.some(
          (value) =>
            value?.view === 'functions' &&
            value.data.some((fn) => fn.addr === 0x400080) &&
            value.data.some((fn) => fn.addr === 0x400090),
        ),
      );
      delta = call('binary_analyze', {
        filePath: sample,
        view: 'instructions',
        address: '0x400090',
        maxItems: 2,
      });
    } else if (index === 2) {
      assert.ok(
        results.some(
          (value) =>
            value?.view === 'instructions' &&
            value.data[0]?.addr === 0x400090 &&
            value.data[0]?.opcode?.includes('0x2a') &&
            value.data[1]?.opcode === 'ret',
        ),
      );
      delta = call('binary_analyze', {
        filePath: sample,
        view: 'xrefs',
        address: '0x400090',
      });
    } else if (index === 3) {
      assert.ok(
        results.some(
          (value) =>
            value?.view === 'xrefs' &&
            value.data.some(
              (ref) => ref.from === 0x400080 && ref.type === 'CALL',
            ),
        ),
      );
      delta = call('drill_record_fact', {
        category: 'note',
        title: 'Native static call evidence',
        notes:
          'ELF entry0 0x400080 calls helper 0x400090; helper contains mov eax,0x2a and ret.',
        evidence: 'sha256=' + sampleHash,
      });
    } else if (index === 4) {
      assert.ok(results.some((value) => value?.success === true));
      delta = call('drill_query_facts', { currentSessionOnly: true });
    } else {
      assert.equal(index, 5);
      assert.ok(
        results.some(
          (value) =>
            Array.isArray(value) &&
            value.some(
              (note) =>
                note.title === 'Native static call evidence' &&
                note.factType === 'note',
            ),
        ),
      );
      delta = { content: 'STATIC_ANALYSIS_DONE' };
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      frame({ choices: [{ delta }] }) +
        frame({
          choices: [
            {
              delta: {},
              finish_reason: delta.tool_calls ? 'tool_calls' : 'stop',
            },
          ],
        }) +
        'data: [DONE]\n\n',
    );
  } catch (error) {
    failures.push(String(error.stack || error));
    res.writeHead(400);
    res.end(
      JSON.stringify({
        error: { message: 'NATIVE_ANALYSIS_FIXTURE_MISMATCH' },
      }),
    );
  }
});
const started = Date.now();
let report;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*)$/i.test(
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
    GEMINI_ULTRA_PROVIDERS_FILE: path.join(scratch, 'providers.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
    GEMINI_ULTRA_TOOL_R2: r2,
    GEMINI_PTY_INFO: 'child_process',
    NO_PROXY: '*',
    NO_COLOR: '1',
  });
  fs.writeFileSync(
    path.join(home, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: {
        enableAutoUpdate: false,
        enableAutoUpdateNotification: false,
        maxAttempts: 2,
      },
      model: { maxSessionTurns: 8 },
      tools: {
        core: ['binary_analyze', 'drill_record_fact', 'drill_query_facts'],
      },
    }),
  );
  fs.writeFileSync(
    env.GEMINI_ULTRA_PROVIDERS_FILE,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'native-fixture',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'fixture',
          name: 'Fixture',
          protocol: 'openai-chat',
          baseUrl: 'http://127.0.0.1:' + address.port,
          apiKey: '',
          models: ['native-fixture'],
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  fs.writeFileSync(
    env.GEMINI_ULTRA_RUNTIME_FILE,
    JSON.stringify({
      collaboration: 'single',
      maxParallel: 1,
      workflow: 'redteam',
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
  let stdout = '',
    stderr = '';
  child = spawn(
    process.execPath,
    [
      entry,
      '-m',
      'native-fixture',
      '-p',
      'Read the generated local ELF functions, helper instructions and incoming call reference, then archive and query the evidence. Do not execute or modify it.',
      '--approval-mode',
      'yolo',
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
  timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 45000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(timer);
  fs.writeFileSync(
    path.join(output, label + '-output.txt'),
    stdout + '\nSTDERR\n' + stderr,
  );
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    // A missing structured result remains an explicit failed check below.
  }
  let notes = [];
  if (fs.existsSync(env.GEMINI_DRILL_DB)) {
    const db = new DatabaseSync(env.GEMINI_DRILL_DB, { readOnly: true });
    try {
      notes = db.prepare('SELECT title,content,evidence FROM note').all();
    } finally {
      db.close();
    }
  }
  const checks = {
    normalCompletion: exitCode === 0 && !timedOut && !result?.error,
    allNativeViews:
      (result?.stats?.tools?.byName?.binary_analyze?.success || 0) === 3,
    sixRequests: requests.length === 6,
    noFixtureMismatch: failures.length === 0,
    exactNativeEvidence:
      notes.length === 1 &&
      notes[0].content.includes('0x400090') &&
      notes[0].evidence.includes(sampleHash),
    querySucceeded:
      (result?.stats?.tools?.byName?.drill_query_facts?.success || 0) === 1,
    sampleUnchanged: hash(sample) === sampleHash,
    finalText: result?.response === 'STATIC_ANALYSIS_DONE',
  };
  report = {
    passed: Object.values(checks).every(Boolean),
    entry,
    version: metadata.version,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    sourceCommit,
    packageSha256,
    r2Version: execFileSync(r2, ['-v'], { encoding: 'utf8' }).split(/\r?\n/)[0],
    elapsedMs: Date.now() - started,
    exitCode,
    timedOut,
    checks,
    requests,
    failures,
    sampleSha256: sampleHash,
    tools: result?.stats?.tools?.byName,
    scope:
      'Actual CLI and native r2 over a generated 256-byte ELF; functions, instructions, incoming call xref and SQLite evidence write/read. Model endpoint is isolated loopback fixture, not live-provider, complex reverse engineering or execution of the sample. Native r2 runs on the recorded host platform/architecture and reads x86-64 ELF instructions without executing them.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(timer);
  if (child?.exitCode === null && !child.killed) child.kill();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-binary-analysis-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
if (!report?.passed) process.exitCode = 1;
