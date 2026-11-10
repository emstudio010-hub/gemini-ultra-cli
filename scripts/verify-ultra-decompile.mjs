import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const entry = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3]);
const ghidraHome = path.resolve(process.argv[4]);
const metadata = JSON.parse(
  fs.readFileSync(path.join(path.dirname(entry), '../package.json'), 'utf8'),
);
const label = path.basename(reportPath, '.json');
const retainedArtifacts = path.join(
  path.dirname(reportPath),
  label + '-artifacts',
);
assert.match(label, /^[a-zA-Z0-9._-]+$/);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-native-decompile-'),
);
const workspace = path.join(scratch, 'workspace');
const profile = path.join(scratch, 'home');
fs.mkdirSync(workspace);
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
const sample = path.join(workspace, 'literal & loop.elf');
// Generated x86-64 ELF: entry calls the helper; helper checks length, loops
// eight bytes through (checksum * 33) XOR byte, then branches on 0x13579bdf.
// Bytes are from the retained, self-authored verify_key C fixture, never run.
const bytes = Buffer.alloc(512);
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
bytes.writeBigUInt64LE(512n, 96);
bytes.writeBigUInt64LE(512n, 104);
bytes.writeBigUInt64LE(4096n, 112);
bytes.set([0xe8, 11, 0, 0, 0, 0xc3], 128);
bytes.set(
  Buffer.from(
    '31c083fe087531b85100000031c9669089c2c1e20501c20fb6040f31d048ffc14883f90875ea89c183e1073ddf9b5713b82a0000000f45c1c3',
    'hex',
  ),
  144,
);
fs.writeFileSync(sample, bytes);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const sampleSha256 = hash(bytes);
const failures = [],
  requests = [];
let result,
  child,
  timedOut = false;
const decode = (value) => {
  for (let i = 0; i < 5; i++) {
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
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.ok(
      payload.tools.some((tool) => tool.function?.name === 'binary_decompile'),
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
          id: 'decompile_' + index,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    let message;
    if (index === 0)
      message = call('binary_decompile', {
        filePath: sample,
        address: '0x400090',
      });
    else if (index === 1) {
      result = results.find(
        (item) => item?.completed === true && item?.codeArtifact,
      );
      if (!result) {
        for (const item of results) {
          const evidence = item?.error?.match(/Evidence directory: (.+)$/)?.[1];
          if (
            evidence &&
            path.resolve(evidence).startsWith(path.resolve(scratch) + path.sep)
          )
            fs.cpSync(evidence, retainedArtifacts, { recursive: true });
        }
      }
      assert.ok(result, JSON.stringify(results));
      assert.equal(result.sampleSha256, sampleSha256);
      assert.equal(result.address, '00400090');
      assert.equal(result.analysisTimedOut, false);
      assert.equal(result.sourceChangedDuringAnalysis, false);
      assert.ok(/while/.test(result.code));
      for (const constant of ['0x51', '0x21', '0x13579bdf', '0x2a'])
        assert.ok(result.code.includes(constant), constant);
      message = call('read_file', { file_path: result.codeArtifact });
    } else if (index === 2) {
      assert.ok(
        results.some(
          (item) => typeof item === 'string' && item.includes('0x13579bdf'),
        ),
      );
      message = {
        content:
          'NATIVE_DECOMPILE_DELIVERED: generated loop and conditional pseudocode retained.',
      };
    } else throw new Error('Unexpected extra request.');
    const response = {
      choices: [
        {
          index: 0,
          ...(payload.stream ? { delta: message } : { message }),
          finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    };
    if (payload.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify(response) + '\n\ndata: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    }
  } catch (error) {
    failures.push(error.stack || String(error));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'Native decompile fixture mismatch' },
      }),
    );
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      providers: [
        {
          id: 'fixture',
          name: 'fixture',
          protocol: 'openai-chat',
          baseUrl: endpoint,
          apiKey: '',
          models: ['fixture-model'],
          updatedAt: new Date().toISOString(),
        },
      ],
      activeProviderId: 'fixture',
      activeModel: 'fixture-model',
      reasoningEffort: 'low',
    }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: {
        enableAutoUpdate: false,
        enableAutoUpdateNotification: false,
        maxAttempts: 1,
      },
      model: { maxSessionTurns: 6 },
      tools: { core: ['binary_decompile', 'read_file'] },
    }),
  );
  const env = {
    ...process.env,
    GEMINI_CLI_HOME: profile,
    HOME: profile,
    USERPROFILE: profile,
    GEMINI_ULTRA_GHIDRA_HOME: ghidraHome,
    NO_COLOR: '1',
    TERM: 'dumb',
    GEMINI_ULTRA_USAGE_LOG: path.join(scratch, 'usage.jsonl'),
  };
  for (const key of Object.keys(env))
    if (
      /^(?:http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/i.test(
        key,
      )
    )
      delete env[key];
  Object.assign(env, {
    GEMINI_CLI_HOME: profile,
    HOME: profile,
    USERPROFILE: profile,
    GEMINI_CLI_NO_RELAUNCH: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_GHIDRA_HOME: ghidraHome,
    ...(process.env.GEMINI_ULTRA_TOOL_JAVA
      ? { GEMINI_ULTRA_TOOL_JAVA: process.env.GEMINI_ULTRA_TOOL_JAVA }
      : {}),
    GEMINI_ULTRA_PROVIDERS_FILE: providers,
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'drill.sqlite'),
    GEMINI_ULTRA_USAGE_LOG: path.join(scratch, 'usage.jsonl'),
    NO_PROXY: '*',
    GEMINI_PTY_INFO: 'child_process',
  });
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
  const started = Date.now();
  child = spawn(
    process.execPath,
    [
      entry,
      '-y',
      '-m',
      'fixture-model',
      '-p',
      'Use binary_decompile to inspect only the supplied generated sample and retain evidence.',
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
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 150000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(timer);
  if (result)
    fs.cpSync(path.dirname(result.codeArtifact), retainedArtifacts, {
      recursive: true,
    });
  const checks = {
    normalExit: exitCode === 0 && !timedOut,
    noFixtureMismatch: failures.length === 0,
    realFunctionResult:
      result?.completed === true && result?.ghidraVersion === '12.1.4',
    expectedLoopAndBranches:
      result?.code.includes('while') && result?.code.includes('0x13579bdf'),
    fullArtifactHash:
      !!result &&
      hash(fs.readFileSync(path.join(retainedArtifacts, 'decompiled.c'))) ===
        result.codeSha256,
    inputUnchanged: hash(fs.readFileSync(sample)) === sampleSha256,
    completeToolReadChain:
      requests.length === 3 && output.includes('NATIVE_DECOMPILE_DELIVERED'),
  };
  const report = {
    passed: Object.values(checks).every(Boolean),
    version: metadata.version,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    exitCode,
    timedOut,
    elapsedMs: Date.now() - started,
    checks,
    requests,
    failures,
    sampleSha256,
    result,
    retainedArtifacts,
    scope:
      'Installed CLI calls native Ghidra/JDK on a generated x86-64 loop-and-branch sample, then reads full retained pseudocode. Loopback model only. Target never executed; not full real-provider autonomy or arbitrary-format reverse-engineering acceptance.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPath.replace(/\.json$/, '-output.txt'), output);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  child?.kill();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-native-decompile-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
