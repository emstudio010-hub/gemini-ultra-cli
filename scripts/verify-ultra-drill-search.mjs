import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-drill-search-'));
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_PROMPTS_FILE: 'prompts.json',
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
      /(?:var|class) DrillStore\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged DrillStore missing');
}
const core = await import(pathToFileURL(module).href);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests++;
  throw new Error('No network allowed');
};
try {
  assert.equal(core.HAS_FTS5, true);
  const database = process.env.GEMINI_DRILL_DB;
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const config = new core.Config({
    sessionId: 'alpha',
    model: 'fixture',
    targetDir: workspace,
    cwd: workspace,
    debugMode: false,
    usageStatisticsEnabled: false,
  });
  await config.storage.initialize();
  let store = core.DrillStore.getInstance();
  store.recordVuln({
    sessionId: 'alpha',
    title: 'Sharedtoken same title',
    severity: 'high',
    status: 'static-reviewed',
    evidence: 'source.ts:7 static observation',
    poc: 'No sample executed',
  });
  store.recordVuln({
    sessionId: 'alpha',
    title: 'Sharedtoken same title',
    evidence: 'Candidate only',
  });
  store.recordBinaryArtifact({
    sessionId: 'alpha',
    samplePath: 'Sharedtoken.elf',
    sha256: 'exact-sha',
    md5: 'exact-md5',
    size: 64,
    highRiskApis: ['read'],
    rvaOffsets: { entry: '0x80' },
    notes: 'Bounded binary metadata',
  });
  store.recordNote({
    sessionId: 'alpha',
    title: 'Sharedtoken note',
    content: 'alpha beta adjacent tokens',
    evidence: 'Complete note evidence',
  });
  store.recordNote({
    sessionId: 'beta',
    title: 'Sharedtoken private note',
    content: 'Private session evidence',
  });
  core.DrillStore.resetInstance();
  const db = new DatabaseSync(database);
  db.exec('DROP TABLE IF EXISTS facts_search_v2');
  db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(session_id UNINDEXED, category, title, content)',
  );
  db.prepare(
    'INSERT INTO facts_fts (session_id,category,title,content) VALUES (?,?,?,?)',
  ).run(
    'alpha',
    'vuln',
    'Sharedtoken stale preview',
    'Legacy index has no canonical IDs',
  );
  const originalRows = Object.fromEntries(
    ['vuln', 'binary_artifact', 'note'].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    ]),
  );
  const legacyIndex = db.prepare('SELECT rowid,* FROM facts_fts').all();
  db.close();
  store = core.DrillStore.getInstance();
  const queryTool = new core.DrillQueryFactsTool(
    config,
    config.getMessageBus(),
  );
  const query = async (keyword, currentSessionOnly = true) => {
    const result = await queryTool
      .build({ keyword, currentSessionOnly })
      .execute({ abortSignal: new globalThis.AbortController().signal });
    assert.equal(result.error, undefined);
    return JSON.parse(result.llmContent);
  };
  const canonical = JSON.parse(JSON.stringify(store.queryFacts('alpha')));
  assert.equal(canonical.length, 4);
  assert.deepEqual(await query('Sharedtoken'), canonical);
  assert.deepEqual(await query('Sharedtok*'), canonical);
  assert.deepEqual(
    await query('"alpha beta"'),
    canonical.filter((row) => row.factType === 'note'),
  );
  assert.deepEqual(
    await query('unverified'),
    canonical.filter((row) => row.status === 'unverified'),
  );
  assert.equal((await query('Sharedtoken', false)).length, 5);
  assert.equal((await query('absent')).length, 0);
  const check = new DatabaseSync(database);
  try {
    assert.deepEqual(
      check.prepare('SELECT rowid,* FROM facts_fts').all(),
      legacyIndex,
    );
    for (const table of Object.keys(originalRows))
      assert.deepEqual(
        check.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        originalRows[table],
      );
    check.exec('DROP TABLE facts_search_v2');
  } finally {
    check.close();
  }
  store.recordNote({
    sessionId: 'alpha',
    title: 'Sharedtoken (offset+4)',
    evidence: 'New record while optional index unavailable',
  });
  assert.equal((await query('(offset+4)')).length, 1);
  assert.equal((await query('Sharedtoken')).length, 5);
  core.DrillStore.resetInstance();
  store = core.DrillStore.getInstance();
  assert.equal((await query('Sharedtok*')).length, 5);
  assert.deepEqual(
    (await query('"alpha beta"'))[0],
    canonical.find((row) => row.factType === 'note'),
  );
  assert.equal(networkRequests, 0);
  const result = {
    passed: true,
    source,
    platform: process.platform,
    node: process.version,
    fts5: core.HAS_FTS5,
    originalCanonicalFacts: 5,
    currentSessionFacts: 5,
    legacyIndexPreserved: true,
    canonicalRowsUnchangedByMigration: true,
    modelRequests: 0,
    networkRequests,
    checks: [
      'real-query-tool-full-records',
      'canonical-ids-and-verification-states',
      'duplicate-title-records-distinct',
      'session-filter',
      'phrase-and-prefix-fts',
      'state-search',
      'legacy-canonical-backfill',
      'old-index-unchanged',
      'missing-index-literal-fallback',
      'new-write-during-index-failure',
      'reopen-rebuilds-derived-index',
    ],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  globalThis.fetch = originalFetch;
  core.DrillStore.resetInstance();
  fs.rmSync(root, { recursive: true, force: true });
}
