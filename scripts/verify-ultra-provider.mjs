import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-cli-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const requests = [],
  runs = [],
  failures = [];
let timedOut = false,
  child,
  timer;
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    requests.push({
      method: request.method,
      url: request.url,
      model: body.model,
    });
    if (request.method === 'GET') {
      assert.equal(request.url, '/unavailable/models');
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }
    assert.equal(request.url, '/alpha/chat/completions');
    assert.equal(body.model, 'route-model');
    assert.ok(requests.length <= 3);
    const message = { content: 'PROVIDER_ROUTE_CONFIRMED' };
    if (body.stream) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        'data: ' +
          JSON.stringify({
            choices: [{ delta: message, finish_reason: 'stop' }],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', ...message },
              finish_reason: 'stop',
            },
          ],
        }),
      );
    }
  } catch (error) {
    failures.push(error.message);
    response.writeHead(400);
    response.end('{}');
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const providers = path.join(scratch, 'providers.json');
  fs.writeFileSync(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'alpha',
      activeModel: 'route-model',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'alpha',
          name: 'Alpha',
          baseUrl: baseUrl + '/alpha',
          protocol: 'openai-chat',
          apiKey: 'fixture-only',
          models: ['route-model'],
          defaultModel: 'route-model',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
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
  const run = async (input, expectedExit = 0) => {
    const before = requests.length;
    child = spawn(
      process.execPath,
      [entry, '-y', '-p', input, '--output-format', 'json'],
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
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 40000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    const result = {
      input,
      exitCode,
      requests: requests.length - before,
      stdout,
      stderr,
    };
    runs.push(result);
    assert.equal(exitCode, expectedExit, stdout + stderr);
    return stdout + stderr;
  };
  await run('/language en');
  const englishList = await run('/provider list');
  assert.ok(englishList.includes('Configured providers'));
  assert.ok(englishList.includes('Custom endpoint'));
  await run(`/provider add Beta ${baseUrl}/beta fixture-key custom-model`);
  let config = JSON.parse(fs.readFileSync(providers, 'utf8'));
  assert.equal(config.activeProviderId, 'beta');
  assert.equal(config.activeModel, 'custom-model');
  assert.equal(config.providers.length, 2);
  await run('/provider use alpha');
  assert.equal(
    requests.length,
    0,
    'Local commands and manual models must not call endpoints',
  );
  assert.ok(
    (await run('Confirm the selected provider.')).includes(
      'PROVIDER_ROUTE_CONFIRMED',
    ),
  );
  assert.equal(requests.length, 1);
  const beforeFailure = fs.readFileSync(providers);
  const failed = await run(
    `/provider add Missing ${baseUrl}/unavailable fixture-key`,
    42,
  );
  assert.ok(failed.includes('No models found'));
  assert.deepEqual(fs.readFileSync(providers), beforeFailure);
  await run('/language 中文');
  assert.ok((await run('/provider list')).includes('已配置的供应商'));
  config = JSON.parse(fs.readFileSync(providers, 'utf8'));
  assert.equal(config.activeProviderId, 'alpha');
  assert.equal(config.activeModel, 'route-model');
  assert.equal(config.providers.length, 2);
  assert.deepEqual(failures, []);
  assert.equal(timedOut, false);
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    ),
  );
  const report = {
    passed: true,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    localRuns: runs.map((run) => ({
      input: run.input,
      exitCode: run.exitCode,
      requests: run.requests,
    })),
    checks: {
      manualModelNoDiscovery: true,
      selectedProviderActualRoute: true,
      failedCatalogRetainsConfigBytes: true,
      bothLocaleLists: true,
      existingProvidersRetained: true,
      noTimeout: true,
    },
    failures,
    scope:
      'Installed native CLI on isolated profile and loopback endpoints; provider persistence, manual model and localized commands. Same-session route synchronization has separate Windows ConPTY evidence; not paid-provider quality or full native collaboration/reverse revalidation.',
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      { passed: false, timedOut, requests, failures, error: error.message },
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
  assert.match(path.basename(scratch), /^ultra-provider-cli-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
