import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const baseline = process.argv[4] === 'baseline';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-card-discovery-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini', 'agents'), { recursive: true });
fs.mkdirSync(workspace);
let models = 0,
  cards = 0,
  cardStartedAt,
  cardClosedAt,
  cardFinishedAt,
  firstModelAt;
let child, watchdog, release;
let timedOut = false;
const started = Date.now();
const server = createServer(async (req, res) => {
  if (req.url === '/slow-card') {
    cards++;
    cardStartedAt = Date.now();
    res.on('close', () => {
      if (!res.writableEnded) cardClosedAt = Date.now();
    });
    if (baseline)
      release = setTimeout(() => {
        cardFinishedAt = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            name: 'slow-agent',
            description: 'Local metadata fixture; do not call.',
            url: `http://127.0.0.1:${server.address().port}/invoke`,
            version: '1.0.0',
            protocolVersion: '0.3.0',
            preferredTransport: 'JSONRPC',
            capabilities: {},
            skills: [],
            defaultInputModes: ['text/plain'],
            defaultOutputModes: ['text/plain'],
          }),
        );
      }, 11500);
    return;
  }
  if (req.url !== '/chat/completions') {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString());
  models++;
  firstModelAt ??= Date.now();
  const content = 'DISCOVERY_READY';
  if (payload.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          choices: [{ delta: { content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          { message: { role: 'assistant', content }, finish_reason: 'stop' },
        ],
      }),
    );
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(
    path.join(profile, '.gemini', 'settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini', 'agents', 'slow-agent.md'),
    `---\nkind: remote\nname: slow-agent\ndescription: Local metadata fixture; do not call.\nagent_card_url: ${baseUrl}/slow-card\n---\n`,
  );
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'fixture-model',
      providers: [
        {
          id: 'fixture',
          name: 'Local fixture',
          baseUrl,
          apiKey: '',
          protocol: 'openai-chat',
          models: ['fixture-model'],
          defaultModel: 'fixture-model',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
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
  child = spawn(
    process.execPath,
    [
      entry,
      '-y',
      '-m',
      'fixture-model',
      '-p',
      'Reply DISCOVERY_READY after registration. Do not call any tools.',
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
  watchdog = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 35000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(watchdog);
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    ),
  );
  const checks = {
    normalExit: exitCode === 0 && !timedOut,
    oneCardRequest: cards === 1,
    oneLoopbackModelRequest: models === 1,
    continuedAfterDiscovery: stdout.includes('DISCOVERY_READY'),
    ...(baseline
      ? {
          waitedForSlowMetadata:
            cardFinishedAt - cardStartedAt >= 11000 &&
            firstModelAt >= cardFinishedAt,
        }
      : {
          cardRequestAborted: !!cardClosedAt,
          boundedCardWait:
            cardClosedAt - cardStartedAt >= 9000 &&
            cardClosedAt - cardStartedAt < 13000,
          diagnosticReported: (stdout + stderr).includes(
            'Agent card discovery exceeded 10 seconds',
          ),
          modelAfterBoundedFailure: firstModelAt >= cardClosedAt - 200,
        }),
  };
  const result = {
    passed: Object.values(checks).every(Boolean),
    baseline,
    version: metadata.version,
    platform: process.platform,
    exitCode,
    timedOut,
    elapsedMs: Date.now() - started,
    cards,
    models,
    cardWaitMs: (baseline ? cardFinishedAt : cardClosedAt) - cardStartedAt,
    checks,
    scope:
      'Actual CLI with isolated profile, one local delayed remote card and loopback model response; no paid model, external target or user configuration change.',
  };
  fs.writeFileSync(
    output.replace(/\.json$/, '') + '-output.txt',
    stdout + '\nSTDERR\n' + stderr,
  );
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.passed, true);
} finally {
  clearTimeout(watchdog);
  clearTimeout(release);
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  fs.rmSync(scratch, { recursive: true, force: true });
}
