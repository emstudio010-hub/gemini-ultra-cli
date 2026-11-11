import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const metadata = JSON.parse(
  fs
    .readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    )
    .replace(/^\uFEFF/, ''),
);
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-search-fallback-'),
);
const requests = [],
  directRequests = [],
  failures = [],
  runs = [];
let mode,
  child,
  timer,
  timedOut = false;
const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith('/search?')) {
      assert.equal(request.headers['x-fixture-transport'], 'ddg-rewrite');
      directRequests.push({ mode, url: request.url });
      response.writeHead(mode === 'failure' ? 503 : 200, {
        'Content-Type': 'text/html',
      });
      response.end(
        mode === 'failure'
          ? 'PRIVATE_HTTP_FAILURE_BODY'
          : '<div class="result results_links"><h2><a>Native fixture title</a></h2><a href="https://example.test/evidence" class="result__url">Example</a><a class="result__snippet">Native fixture snippet</a></div>',
      );
      return;
    }
    assert.equal(request.url, '/chat/completions');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const results = payload.messages.filter(
      (message) => message.role === 'tool',
    );
    const lastUser = payload.messages
      .filter((message) => message.role === 'user')
      .at(-1)?.content;
    const userText =
      typeof lastUser === 'string'
        ? lastUser
        : (lastUser || []).map((part) => part.text || '').join('');
    let message, phase;
    if (results.length) {
      const text = JSON.stringify(results);
      if (mode === 'failure') {
        assert.ok(
          results.some((result) => {
            const content = JSON.parse(result.content);
            return (
              typeof content.error === 'string' &&
              content.error.includes('HTTP 503')
            );
          }),
          text,
        );
        assert.ok(!text.includes('PRIVATE_HTTP_FAILURE_BODY'));
      } else
        assert.ok(
          text.includes('Native fixture title') &&
            text.includes('https://example.test/evidence') &&
            text.includes('Native fixture snippet'),
        );
      message = {
        content:
          mode === 'failure'
            ? 'SEARCH_FAILURE_OBSERVED'
            : 'SEARCH_SUCCESS_OBSERVED',
      };
      phase = 'observed-tool-result';
      requests.push({ mode, phase, results });
    } else if (userText === `fixture ${mode} query`) {
      message = {
        content:
          '<｜｜DSML｜｜calls>fixture unsupported grounding</｜｜DSML｜｜calls>',
      };
      phase = 'unsupported-grounding';
      requests.push({ mode, phase });
    } else {
      message = {
        content: '',
        tool_calls: [
          {
            index: 0,
            id: `search_${mode}`,
            type: 'function',
            function: {
              name: 'google_web_search',
              arguments: JSON.stringify({ query: `fixture ${mode} query` }),
            },
          },
        ],
      };
      phase = 'request-tool';
      requests.push({ mode, phase });
    }
    const finish = message.tool_calls ? 'tool_calls' : 'stop';
    response.writeHead(200, {
      'Content-Type': payload.stream ? 'text/event-stream' : 'application/json',
    });
    response.end(
      payload.stream
        ? `data: ${JSON.stringify({ choices: [{ delta: message, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`
        : JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', ...message },
                finish_reason: finish,
              },
            ],
          }),
    );
  } catch (error) {
    failures.push(String(error));
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        error: { message: 'Local search fixture assertion failed' },
      }),
    );
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const preload = path.join(scratch, 'local-search-transport.mjs');
  fs.writeFileSync(
    preload,
    `const original=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);if(url.origin==='https://html.duckduckgo.com'&&url.pathname==='/html/'){const target=new URL('/search',${JSON.stringify(base)});target.search=url.search;return original(target,{...options,headers:{...options?.headers,'X-Fixture-Transport':'ddg-rewrite'}});}if(url.protocol==='data:')return original(input,options);if(url.hostname!=='127.0.0.1')throw new Error('External network disabled by local fixture');return original(input,options);};`,
  );
  for (mode of ['failure', 'success']) {
    const profile = path.join(scratch, mode),
      workspace = path.join(profile, 'workspace');
    fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
    fs.mkdirSync(workspace);
    fs.writeFileSync(
      path.join(profile, '.gemini/settings.json'),
      JSON.stringify({
        security: { auth: { selectedType: 'gateway' } },
        privacy: { usageStatisticsEnabled: false },
        general: {
          enableAutoUpdate: false,
          enableAutoUpdateNotification: false,
        },
        model: { maxSessionTurns: 4 },
        tools: { core: ['google_web_search'] },
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
      GEMINI_CLI_NO_RELAUNCH: '1',
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
      NODE_OPTIONS: '--import=' + pathToFileURL(preload).href,
      GEMINI_ULTRA_PROVIDERS_FILE: path.join(profile, 'providers.json'),
      GEMINI_ULTRA_LOCALE_FILE: path.join(profile, 'locale.json'),
      GEMINI_ULTRA_RUNTIME_FILE: path.join(profile, 'runtime.json'),
      GEMINI_ULTRA_PROMPTS_FILE: path.join(profile, 'prompts.json'),
      GEMINI_DRILL_DIR: path.join(profile, 'drill'),
      GEMINI_DRILL_DB: path.join(profile, 'facts.sqlite'),
      NO_PROXY: '*',
    });
    fs.writeFileSync(
      env.GEMINI_ULTRA_LOCALE_FILE,
      JSON.stringify({ locale: 'en' }),
    );
    fs.writeFileSync(
      env.GEMINI_ULTRA_PROVIDERS_FILE,
      JSON.stringify({
        version: 1,
        activeProviderId: 'fixture',
        activeModel: 'fixture-model',
        providers: [
          {
            id: 'fixture',
            name: 'Fixture',
            baseUrl: base,
            apiKey: '',
            protocol: 'openai-chat',
            models: ['fixture-model'],
            defaultModel: 'fixture-model',
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    child = spawn(
      process.execPath,
      [
        entry,
        '-y',
        '-m',
        'fixture-model',
        '-p',
        'Run the built-in web_search once for this fixture task.',
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
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 60000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    runs.push({ mode, exitCode, stdout, stderr });
    assert.equal(exitCode, 0);
    assert.equal(timedOut, false);
    assert.ok(
      stdout.includes(
        mode === 'failure'
          ? 'SEARCH_FAILURE_OBSERVED'
          : 'SEARCH_SUCCESS_OBSERVED',
      ),
    );
    assert.equal(requests.filter((item) => item.mode === mode).length, 3);
    assert.equal(directRequests.filter((item) => item.mode === mode).length, 1);
    assert.equal(failures.length, 0);
  }
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: true,
        version: metadata.version,
        platform: process.platform,
        timedOut,
        requests,
        directRequests,
        failures,
        runs: runs.map(({ mode, exitCode }) => ({ mode, exitCode })),
        scope:
          'Two actual CLI processes and real local HTTP exchanges. A child-only preload rewrites the hardcoded DuckDuckGo transport to loopback, preserving query/signals/headers; other external fetches are refused. Model responses are local protocol fixtures, not paid providers or live search availability. Unit checks separately cover deadline, size and cancellation.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      version: metadata.version,
      requests: requests.length,
      directRequests: directRequests.length,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        passed: false,
        timedOut,
        error: error.message,
        requests,
        directRequests,
        failures,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    output.replace(/\.json$/, '-output.txt'),
    runs
      .map((run) => run.mode + '\n' + run.stdout + '\nSTDERR\n' + run.stderr)
      .join('\n'),
  );
}
