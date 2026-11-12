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
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-drill-verification-'),
);
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
      /(?:var|class) DrillRecordFactTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged DrillRecordFactTool missing');
}
const core = await import(pathToFileURL(module).href);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests++;
  throw new Error('No network allowed');
};
try {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const config = new core.Config({
    sessionId: 'verification-fixture',
    model: 'fixture',
    targetDir: workspace,
    cwd: workspace,
    debugMode: false,
    usageStatisticsEnabled: false,
  });
  await config.storage.initialize();
  const store = core.DrillStore.getInstance();
  const db = new DatabaseSync(process.env.GEMINI_DRILL_DB);
  try {
    db.prepare(
      'INSERT INTO vuln (session_id,title,status,evidence,created_at) VALUES (?,?,?,?,?)',
    ).run(
      'legacy',
      'Legacy row retained without reclassification',
      'verified',
      '',
      '2026-11-01T00:00:00Z',
    );
  } finally {
    db.close();
  }
  const legacy = store.queryFacts('legacy');
  const tool = new core.DrillRecordFactTool(config, config.getMessageBus());
  assert.deepEqual(tool.schema.parametersJsonSchema.properties.status.enum, [
    'unverified',
    'static-reviewed',
    'verified',
  ]);
  const record = async (params) => {
    const result = await tool
      .build(params)
      .execute({ abortSignal: new globalThis.AbortController().signal });
    assert.equal(result.error, undefined);
    return JSON.parse(result.llmContent);
  };
  assert.equal(
    (await record({ category: 'vuln', title: 'Candidate with no evidence' }))
      .status,
    'unverified',
  );
  assert.equal(
    (
      await record({
        category: 'vuln',
        title: 'Static source review',
        status: 'static-reviewed',
        evidence: 'source.ts:6 input reaches file read; sample not executed',
      })
    ).status,
    'static-reviewed',
  );
  assert.equal(
    (
      await record({
        category: 'vuln',
        title: 'Explicit validation',
        status: 'verified',
        evidence:
          'Specific validation outcome and evidence artifact supplied by caller',
      })
    ).status,
    'verified',
  );
  await record({
    category: 'note',
    title: 'Ordinary note remains valid',
    notes: 'Read-only observation',
  });
  const before = store.queryFacts('verification-fixture');
  for (const params of [
    { category: 'vuln', title: 'No evidence', status: 'verified' },
    {
      category: 'vuln',
      title: 'Blank evidence',
      status: 'static-reviewed',
      evidence: '  ',
    },
    { category: 'vuln', title: 'Invalid state', status: 'guessed' },
    {
      category: 'note',
      title: 'Misplaced state',
      status: 'verified',
      evidence: 'note',
    },
  ]) {
    const value = core.recordFactTool('verification-fixture', params);
    assert.equal(value.success, false);
    assert.ok(value.error);
  }
  assert.throws(
    () =>
      store.recordVuln({
        sessionId: 'verification-fixture',
        title: 'Direct empty verified',
        status: 'verified',
      }),
    /evidence/i,
  );
  assert.deepEqual(store.queryFacts('verification-fixture'), before);
  assert.deepEqual(store.queryFacts('legacy'), legacy);
  core.DrillStore.resetInstance();
  const reopened = core.DrillStore.getInstance();
  assert.deepEqual(reopened.queryFacts('legacy'), legacy);
  const rows = reopened.queryFacts('verification-fixture');
  const states = rows
    .filter((row) => row.factType === 'vuln')
    .map((row) => row.status)
    .sort();
  assert.deepEqual(states, ['static-reviewed', 'unverified', 'verified']);
  assert.equal(rows.length, 4);
  assert.equal(networkRequests, 0);
  const result = {
    passed: true,
    source,
    platform: process.platform,
    node: process.version,
    states,
    facts: rows.length,
    rejectedWrites: 5,
    legacyRowsPreserved: true,
    modelRequests: 0,
    networkRequests,
    checks: [
      'real-tool-schema-and-execution',
      'candidate-default-unverified',
      'explicit-static-and-verified-status',
      'promoted-evidence-required',
      'direct-helper-validation',
      'non-vuln-status-rejected',
      'ordinary-note-compatible',
      'sqlite-reopen-retains-states',
      'historical-verified-row-unchanged',
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
