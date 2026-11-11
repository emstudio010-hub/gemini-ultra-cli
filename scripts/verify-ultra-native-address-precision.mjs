import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  highAddressBase,
  highAddressElfFixture,
} from './high-address-elf-fixture.mjs';
const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const nativeDirectory = process.env.ULTRA_VERIFY_NATIVE_DIRECTORY;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-address-precision-'));
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(root, name);
const workspace = path.join(root, 'workspace');
fs.mkdirSync(workspace);
const sample = path.join(workspace, 'high & literal.elf');
fs.writeFileSync(sample, highAddressElfFixture());
const hash = () =>
  createHash('sha256').update(fs.readFileSync(sample)).digest('hex');
const before = hash();
let core;
if (source)
  core = await import(
    pathToFileURL(path.join(repo, 'packages/core/dist/index.js')).href
  );
else {
  const directory = path.dirname(entry);
  const module = fs
    .readdirSync(directory)
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(directory, name))
    .find((file) =>
      /(?:var|class) BinaryInspectTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module);
  core = await import(pathToFileURL(module).href);
}
const config = new core.Config({
  sessionId: 'native-address-fixture',
  model: 'fixture',
  targetDir: workspace,
  cwd: workspace,
  debugMode: false,
  usageStatisticsEnabled: false,
});
await config.storage.initialize();
const bus = config.getMessageBus();
const inspect = new core.BinaryInspectTool(config, bus),
  analyze = new core.BinaryAnalyzeTool(config, bus);
const originalExec = childProcess.execFile;
const entryAddress = (highAddressBase + 128n).toString(),
  helperAddress = (highAddressBase + 144n).toString();
const calls = [];
const fixtureJson = {
  info: `{"info":{"baddr":${highAddressBase},"bits":64,"name":"numeric 18446603336221196417"}}`,
  functions: `[{"addr":${entryAddress},"name":"entry0"},{"addr":${helperAddress},"name":"helper"}]`,
  instructions: `[{"addr":${entryAddress},"opcode":"call high","jump":${helperAddress},"size":5},{"addr":${highAddressBase + 133n},"opcode":"ret","size":1}]`,
  xrefs: `[{"from":${entryAddress},"type":"CALL"}]`,
};
const run = async () => {
  const execute = async (tool, params) => {
    const result = await tool
      .build(params)
      .execute({ abortSignal: new globalThis.AbortController().signal });
    assert.equal(result.error, undefined, JSON.stringify(result));
    return JSON.parse(result.llmContent);
  };
  const info = await execute(inspect, { filePath: path.basename(sample) });
  assert.equal(info.data.baddr, highAddressBase.toString());
  assert.equal(info.data.bits, 64);
  const functions = await execute(analyze, {
    filePath: path.basename(sample),
    view: 'functions',
  });
  assert.ok(functions.data.some((row) => row.addr === entryAddress));
  assert.ok(functions.data.some((row) => row.addr === helperAddress));
  assert.equal(
    new Set(functions.data.map((row) => row.addr)).size,
    functions.data.length,
  );
  const instructions = await execute(analyze, {
    filePath: path.basename(sample),
    view: 'instructions',
    address: entryAddress,
    maxItems: 2,
  });
  assert.equal(instructions.data[0].addr, entryAddress);
  assert.equal(instructions.data[0].jump, helperAddress);
  assert.equal(instructions.data[0].size, 5);
  assert.equal(instructions.data[1].addr, (highAddressBase + 133n).toString());
  const xrefs = await execute(analyze, {
    filePath: path.basename(sample),
    view: 'xrefs',
    address: helperAddress,
  });
  assert.ok(
    xrefs.data.some((row) => row.from === entryAddress && row.type === 'CALL'),
  );
  return { info, functions, instructions, xrefs };
};
try {
  process.env.GEMINI_ULTRA_TOOL_R2 = process.execPath;
  process.env.GEMINI_ULTRA_TOOL_RABIN2 = process.execPath;
  // Controlled raw native JSON only; the real product parses and validates it.
  childProcess.execFile = (file, args, options, callback) => {
    assert.equal(file, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(args.at(-1), sample);
    const command = args[args.indexOf('-c') + 1];
    const view = args.includes('-Ij')
      ? 'info'
      : command === 'aa;aflj'
        ? 'functions'
        : command.startsWith('pdj ')
          ? 'instructions'
          : command.startsWith('aaa;axtj @ ')
            ? 'xrefs'
            : undefined;
    assert.ok(view);
    calls.push({ view, args });
    callback(null, fixtureJson[view], '');
  };
  syncBuiltinESMExports();
  let controlled;
  try {
    controlled = await run();
  } finally {
    childProcess.execFile = originalExec;
    syncBuiltinESMExports();
  }
  assert.equal(calls.length, 4);
  assert.ok(
    calls
      .find((call) => call.view === 'instructions')
      .args.includes('pdj 3 @ 0xffff800000000080'),
  );
  assert.ok(
    calls
      .find((call) => call.view === 'xrefs')
      .args.includes('aaa;axtj @ 0xffff800000000090'),
  );
  assert.equal(controlled.info.data.name, 'numeric 18446603336221196417');
  let native;
  if (nativeDirectory) {
    process.env.GEMINI_ULTRA_TOOL_R2 = path.join(
      nativeDirectory,
      process.platform === 'win32' ? 'r2.exe' : 'r2',
    );
    process.env.GEMINI_ULTRA_TOOL_RABIN2 = path.join(
      nativeDirectory,
      process.platform === 'win32' ? 'rabin2.exe' : 'rabin2',
    );
    native = await run();
  }
  assert.equal(hash(), before);
  const result = {
    passed: true,
    source,
    platform: process.platform,
    node: process.version,
    before,
    after: hash(),
    expected: {
      base: highAddressBase.toString(),
      entry: entryAddress,
      helper: helperAddress,
    },
    controlledNativeJson: controlled,
    calls,
    native: native || null,
    modelRequests: 0,
    sampleExecuted: false,
    scope:
      'Actual product tool classes with Config. Four controlled native JSON views verify integer precision and address reuse; optional native results use installed r2/rabin2 over an artificial ELF. No sample execution or model requests.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      platform: process.platform,
      controlledViews: 4,
      nativeViews: native ? 4 : 0,
      node: process.version,
    }),
  );
} finally {
  childProcess.execFile = originalExec;
  syncBuiltinESMExports();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-address-precision-/);
  fs.rmSync(root, { recursive: true, force: true });
}
