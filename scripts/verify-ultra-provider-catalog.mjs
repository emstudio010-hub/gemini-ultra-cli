import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-provider-catalog-'));
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(root, name);
let module;
if (source) module = path.join(repo, 'packages/core/dist/index.js');
else {
  const directory = path.dirname(entry);
  module = fs
    .readdirSync(directory)
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(directory, name))
    .find((file) =>
      /(?:var|class) ProviderManager\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged ProviderManager missing');
}
const { ProviderManager } = await import(pathToFileURL(module).href);
const routes = [];
const closed = [];
let onCancelHeaders;
const server = createServer((req, res) => {
  routes.push(req.url);
  res.on('close', () => closed.push(req.url));
  if (req.url === '/declared/models') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(2 * 1024 * 1024 + 1),
    });
    res.write('{');
  } else if (req.url === '/streamed/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(' '.repeat(2 * 1024 * 1024 + 1));
  } else if (req.url === '/timeout/models' || req.url === '/cancel/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"data":[');
    if (req.url === '/cancel/models') onCancelHeaders?.();
  } else if (req.url === '/normal/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    const bytes = Buffer.from(
      JSON.stringify({
        models: ['models/中文模型', { id: 'normal' }, 'normal', ' custom '],
      }),
    );
    res.write(bytes.subarray(0, 24));
    res.end(bytes.subarray(24));
  } else {
    res.writeHead(404);
    res.end();
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const manager = new ProviderManager(process.env.GEMINI_ULTRA_PROVIDERS_FILE);
  const seed = manager.upsertProvider({
    name: 'Saved configuration',
    baseUrl: base + '/normal',
    apiKey: 'FAKE_CATALOG_KEY',
    models: ['saved-model'],
  });
  const before = fs.readFileSync(process.env.GEMINI_ULTRA_PROVIDERS_FILE);
  const discover = (route, extra = {}) =>
    manager.fetchModelsFromEndpoint({
      baseUrl: base + route,
      apiKey: 'FAKE_CATALOG_KEY',
      timeoutMs: 2000,
      ...extra,
    });
  const declared = await discover('/declared');
  assert.deepEqual(declared.models, []);
  assert.match(declared.error, /2 MiB/);
  const streamed = await discover('/streamed');
  assert.deepEqual(streamed.models, []);
  assert.match(streamed.error, /2 MiB/);
  const timed = await discover('/timeout', { timeoutMs: 300 });
  assert.equal(timed.error, 'Model discovery timed out.');
  const cancel = new globalThis.AbortController();
  const headersArrived = new Promise((resolve) => {
    onCancelHeaders = resolve;
  });
  const cancelledPromise = discover('/cancel', { signal: cancel.signal });
  await Promise.race([
    headersArrived,
    new Promise((_resolve, reject) =>
      globalThis.setTimeout(
        () => reject(new Error('Cancel fixture headers did not arrive')),
        3000,
      ),
    ),
  ]);
  cancel.abort();
  const cancelled = await cancelledPromise;
  assert.equal(cancelled.error, 'Model discovery cancelled.');
  const already = new globalThis.AbortController();
  already.abort();
  const count = routes.length;
  assert.equal(
    (await discover('/pre-cancelled', { signal: already.signal })).error,
    'Model discovery cancelled.',
  );
  assert.equal(routes.length, count);
  const normal = await discover('/normal');
  assert.deepEqual(normal, { models: ['中文模型', 'normal', 'custom'] });
  assert.deepEqual(
    fs.readFileSync(process.env.GEMINI_ULTRA_PROVIDERS_FILE),
    before,
  );
  assert.equal(manager.getActiveProvider().id, seed.id);
  assert.equal(manager.getActiveModel(), 'saved-model');
  await new Promise((resolve) => globalThis.setTimeout(resolve, 30));
  for (const route of ['/declared/models', '/timeout/models', '/cancel/models'])
    assert.ok(closed.includes(route), route + ' connection did not close');
  assert.deepEqual(routes, [
    '/declared/models',
    '/streamed/models',
    '/timeout/models',
    '/cancel/models',
    '/normal/models',
  ]);
  const result = {
    passed: true,
    source,
    platform: process.platform,
    node: process.version,
    catalogRequests: routes.length,
    modelRequests: 0,
    externalRequests: 0,
    configurationUnchanged: true,
    checks: [
      'declared-size-rejected',
      'streamed-size-rejected',
      'body-timeout',
      'body-cancellation',
      'pre-cancelled-no-request',
      'normal-utf8-models',
      'saved-selection-unchanged',
      'stalled-connections-closed',
    ],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
