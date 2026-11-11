import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { minimalPeFixture } from './minimal-pe-fixture.mjs';

const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const nativeDirectory = process.env.ULTRA_VERIFY_NATIVE_DIRECTORY;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-binary-read-'));
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_DRILL_DB: 'facts.sqlite',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
}))
  process.env[key] = path.join(scratch, name);
for (const key of Object.keys(process.env))
  if (key.startsWith('GEMINI_ULTRA_TOOL_')) delete process.env[key];
const workspace = path.join(scratch, 'workspace'),
  foreign = path.join(scratch, 'foreign');
fs.mkdirSync(workspace);
fs.mkdirSync(foreign);
const allowed = path.join(workspace, 'literal & sample.exe'),
  denied = path.join(foreign, 'outside.exe');
fs.writeFileSync(allowed, minimalPeFixture());
fs.writeFileSync(denied, 'PRIVATE_BINARY_SCOPE_MARKER');
const link = path.join(workspace, 'redirected.exe');
fs.symlinkSync(denied, link, 'file');
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = { allowed: hash(allowed), denied: hash(denied) };
let core, tools;
if (source) {
  const load = (relative) =>
    import(pathToFileURL(path.join(repo, relative)).href);
  core = await load('packages/core/dist/index.js');
  tools = {
    ...(await load('packages/core/dist/src/tools/binaryInspect.js')),
    ...(await load('packages/core/dist/src/tools/binaryAnalyze.js')),
    ...(await load('packages/core/dist/src/tools/reverseTools.js')),
  };
} else {
  const directory = path.dirname(entry);
  const module = fs
    .readdirSync(directory)
    .filter((file) => /^chunk-.+\.js$/.test(file))
    .map((file) => path.join(directory, file))
    .find((file) =>
      /(?:var|class) BinaryInspectTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged native binary tools missing');
  core = tools = await import(pathToFileURL(module).href);
}
const config = new core.Config({
  sessionId: 'binary-read-fixture',
  model: 'fixture',
  targetDir: workspace,
  cwd: workspace,
  debugMode: false,
  usageStatisticsEnabled: false,
});
await config.storage.initialize();
const bus = config.getMessageBus();
const constructors = [
  tools.BinaryTriageTool,
  tools.BinaryInspectTool,
  tools.BinaryAnalyzeTool,
];
const denials = [],
  native = [];
try {
  for (const Tool of constructors) {
    const tool = new Tool(config, bus);
    for (const filePath of [denied, link]) {
      const result = await tool
        .build({ filePath })
        .execute({ abortSignal: new globalThis.AbortController().signal });
      assert.ok(
        result.error?.message.includes('Path not in workspace'),
        JSON.stringify(result),
      );
      assert.ok(
        !JSON.stringify(result).includes('PRIVATE_BINARY_SCOPE_MARKER'),
      );
      denials.push({ tool: Tool.Name, filePath, error: result.error });
    }
  }
  assert.equal(
    fs.existsSync(process.env.GEMINI_DRILL_DB),
    false,
    'Denied triage must not create fact storage',
  );
  const triage = await new tools.BinaryTriageTool(config, bus)
    .build({ filePath: path.basename(allowed) })
    .execute({ abortSignal: new globalThis.AbortController().signal });
  assert.equal(triage.error, undefined);
  const parsed = JSON.parse(triage.llmContent);
  assert.equal(parsed.samplePath, fs.realpathSync(allowed));
  assert.equal(parsed.sha256, before.allowed);
  assert.ok(parsed.fileType.includes('PE'));
  if (nativeDirectory) {
    process.env.GEMINI_ULTRA_TOOL_R2 = path.join(
      nativeDirectory,
      process.platform === 'win32' ? 'r2.exe' : 'r2',
    );
    process.env.GEMINI_ULTRA_TOOL_RABIN2 = path.join(
      nativeDirectory,
      process.platform === 'win32' ? 'rabin2.exe' : 'rabin2',
    );
    for (const [Tool, params] of [
      [
        tools.BinaryInspectTool,
        { filePath: path.basename(allowed), view: 'imports' },
      ],
      [
        tools.BinaryAnalyzeTool,
        { filePath: path.basename(allowed), view: 'functions' },
      ],
    ]) {
      const result = await new Tool(config, bus)
        .build(params)
        .execute({ abortSignal: new globalThis.AbortController().signal });
      assert.equal(result.error, undefined, JSON.stringify(result));
      const value = JSON.parse(result.llmContent);
      assert.equal(value.samplePath, fs.realpathSync(allowed));
      assert.ok(value.data.length > 0);
      native.push({ tool: Tool.Name, result: value });
    }
    assert.ok(
      native[0].result.data.some((item) => item.name === 'ExitProcess'),
    );
  }
  const store = core.DrillStore.getInstance();
  const facts = store.queryFacts(config.getSessionId());
  assert.equal(facts.length, 1);
  assert.equal(facts[0].sha256, before.allowed);
  const after = { allowed: hash(allowed), denied: hash(denied) };
  assert.deepEqual(after, before);
  const result = {
    passed: true,
    platform: process.platform,
    source,
    denials,
    triage: parsed,
    native,
    before,
    after,
    modelRequests: 0,
    factCount: facts.length,
    scope:
      'Actual product tool invocations and real Config workspace validation; canonical external files and workspace symlinks refused before discovery, allowed relative triage parsed and stored once. Optional native tool positives use installed radare2; sample never executed. No model request or broad reverse-engineering acceptance.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      denials: denials.length,
      native: native.length,
      modelRequests: 0,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      { passed: false, error: String(error), denials, native },
      null,
      2,
    ),
  );
  throw error;
} finally {
  core.DrillStore.resetInstance();
}
