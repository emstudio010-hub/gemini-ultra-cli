import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const worker = process.argv.includes('--worker');
const script = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(script), '..');
let module;
if (source)
  module = path.join(
    repo,
    'packages/core/dist/src/providers/providerManager.js',
  );
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
const { ProviderManager, ProviderConfigConflictError } = await import(
  pathToFileURL(module).href
);
assert.equal(typeof ProviderConfigConflictError, 'function');
const profile = (name) => ({
  name,
  baseUrl: 'https://fixture.invalid/v1',
  apiKey: 'FAKE_CONFIG_CONFLICT_KEY',
  models: ['fixture'],
  setActive: false,
});
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const waitFor = async (predicate, label) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 20000) throw new Error('Timed out: ' + label);
    await pause(25);
  }
};
if (worker) {
  const index = process.argv.indexOf('--worker');
  const [file, ready, go, name] = process.argv.slice(index + 1, index + 5);
  const manager = new ProviderManager(file);
  fs.writeFileSync(ready, 'READY');
  await waitFor(() => fs.existsSync(go), 'parent race barrier');
  let result;
  try {
    manager.upsertProvider(profile(name));
    result = { saved: true, name };
  } catch (error) {
    assert.ok(error instanceof ProviderConfigConflictError);
    result = {
      saved: false,
      name,
      error: { name: error.name, message: error.message },
    };
  }
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  process.exit(0);
}
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-provider-save-conflict-'),
);
process.env.GEMINI_ULTRA_LOCALE_FILE = path.join(root, 'locale.json');
fs.writeFileSync(
  process.env.GEMINI_ULTRA_LOCALE_FILE,
  JSON.stringify({ locale: 'en' }),
);
const file = path.join(root, 'providers.json');
const processes = [];
try {
  const initial = new ProviderManager(file);
  initial.upsertProvider({ ...profile('Seed'), setActive: true });
  const backupBefore = hash(file);
  const go = path.join(root, 'go');
  const workers = ['Alpha', 'Beta'].map((name) => {
    const ready = path.join(root, name + '.ready'),
      result = path.join(root, name + '.json');
    const child = spawn(
      process.execPath,
      [
        script,
        entry,
        result,
        '--worker',
        file,
        ready,
        go,
        name,
        ...(source ? ['--source'] : []),
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GEMINI_ULTRA_LOCALE_FILE: path.join(root, 'locale.json'),
        },
      },
    );
    processes.push(child);
    let diagnostics = '';
    child.stdout.on('data', (data) => {
      diagnostics += data;
    });
    child.stderr.on('data', (data) => {
      diagnostics += data;
    });
    const completion = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, diagnostics }));
    });
    return { name, ready, result, child, completion };
  });
  await waitFor(
    () => workers.every((item) => fs.existsSync(item.ready)),
    'both cached snapshots loaded',
  );
  fs.writeFileSync(go, 'GO');
  await waitFor(
    () => workers.every((item) => fs.existsSync(item.result)),
    'both save outcomes',
  );
  const exits = await Promise.all(workers.map((item) => item.completion));
  assert.ok(
    exits.every((item) => item.code === 0),
    JSON.stringify(exits),
  );
  const outcomes = workers.map((item) =>
    JSON.parse(fs.readFileSync(item.result, 'utf8')),
  );
  const winner = outcomes.find((item) => item.saved),
    loser = outcomes.find((item) => !item.saved);
  assert.ok(winner && loser);
  assert.equal(outcomes.filter((item) => item.saved).length, 1);
  assert.equal(loser.error.name, 'ProviderConfigConflictError');
  const saved = new ProviderManager(file);
  assert.deepEqual(
    saved
      .listProviders()
      .map((item) => item.name)
      .sort(),
    ['Seed', winner.name].sort(),
  );
  assert.equal(hash(file + '.bak'), backupBefore);
  assert.equal(fs.existsSync(file + '.lock'), false);
  assert.equal(
    fs.readdirSync(root).filter((name) => name.endsWith('.tmp')).length,
    0,
  );
  const afterRace = hash(file);
  saved.upsertProvider(profile(loser.name));
  assert.deepEqual(
    new ProviderManager(file)
      .listProviders()
      .map((item) => item.name)
      .sort(),
    ['Alpha', 'Beta', 'Seed'],
  );
  assert.equal(hash(file + '.bak'), afterRace);
  const result = {
    passed: true,
    source,
    platform: process.platform,
    workers: outcomes,
    exitCodes: exits.map((item) => item.code),
    oneWinner: true,
    noLostUpdate: true,
    backupPreserved: true,
    noResidualLock: true,
    reloadedRetryPreservedBoth: true,
    finalProviders: 3,
    modelRequests: 0,
    scope:
      'Two real Node processes load the same actual ProviderManager snapshot before a simultaneous file barrier. One save succeeds and one is rejected; a new snapshot retries without losing the winner. Artificial configuration only, not network filesystem/hard crash or old-client compatibility.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-provider-save-conflict-/);
  fs.rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
