import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const nativeSample = process.env.ULTRA_ADDRESS_FORMATS_SAMPLE;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-address-formats-'));
for (const [key, file] of Object.entries({
  GEMINI_CLI_HOME: 'home',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(root, file);
const originalExec = childProcess.execFile,
  originalFetch = globalThis.fetch;
const fixture = {
  functions:
    '[{"addr":4198528,"name":"entry0","size":16},{"offset":18446603336221196417,"name":"high"}]',
  instructions:
    '[{"addr":4198537,"opcode":"call target","jump":4198464,"size":5},{"addr":18446603336221196417,"opcode":"call high","jump":18446744073709551615,"ptr":-1},{"addr":16,"opcode":"omitted"}]',
  xrefs:
    '[{"from":4198468,"type":"CALL","fcn_addr":4198464,"to":"4198400"},{"from":18446603336221196417,"type":"CALL","fcn_addr":18446744073709551615}]',
};
const commands = [],
  results = [];
let config,
  core,
  networkRequests = 0;
globalThis.fetch = () => {
  networkRequests++;
  throw new Error('Offline address formatting only');
};
try {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const sample = nativeSample || path.join(workspace, 'fixture.bin');
  if (!nativeSample)
    fs.writeFileSync(sample, 'controlled native output fixture');
  const canonicalSample = fs.realpathSync.native(sample);
  const module = fs
    .readdirSync(path.dirname(entry))
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(path.dirname(entry), name))
    .find((file) =>
      /(?:var|class) BinaryAnalyzeTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module);
  core = await import(pathToFileURL(module).href);
  config = new core.Config({
    sessionId: 'address-format-verification',
    model: 'fixture',
    targetDir: nativeSample ? path.dirname(sample) : workspace,
    cwd: nativeSample ? path.dirname(sample) : workspace,
    debugMode: false,
    usageStatisticsEnabled: false,
  });
  await config.storage.initialize();
  const tool = new core.BinaryAnalyzeTool(config, config.getMessageBus());
  if (!nativeSample) {
    process.env.GEMINI_ULTRA_TOOL_R2 = process.execPath;
    childProcess.execFile = (file, args, options, callback) => {
      try {
        assert.equal(file, process.execPath);
        assert.equal(options.shell, false);
        assert.equal(args.at(-1), canonicalSample);
      } catch (error) {
        console.error(error);
        throw error;
      }
      const command = args[args.indexOf('-c') + 1];
      commands.push(command);
      callback(
        null,
        command.startsWith('aa;')
          ? fixture.functions
          : command.startsWith('aaa;')
            ? fixture.xrefs
            : fixture.instructions,
        '',
      );
      return {};
    };
    syncBuiltinESMExports();
  }
  for (const view of ['functions', 'instructions', 'xrefs']) {
    const params = {
      filePath: sample,
      view,
      maxItems: nativeSample
        ? view === 'functions'
          ? 3
          : view === 'instructions'
            ? 6
            : 2
        : 2,
      ...(view !== 'functions'
        ? { address: nativeSample ? '0x401040' : '18446603336221196417' }
        : {}),
    };
    const result = await tool
      .build(params)
      .execute({ abortSignal: new globalThis.AbortController().signal });
    assert.equal(result.error, undefined, result.error?.message);
    const body = JSON.parse(result.llmContent);
    results.push(body);
    if (!nativeSample) {
      const expected = JSON.parse(
        fixture[view]
          .replace(/18446603336221196417/g, '"18446603336221196417"')
          .replace(/18446744073709551615/g, '"18446744073709551615"'),
      ).slice(0, 2);
      assert.deepEqual(body.data, expected);
      const formats =
        view === 'functions'
          ? [
              { itemIndex: 0, hex: { addr: '0x401080' } },
              { itemIndex: 1, hex: { offset: '0xffff800000000081' } },
            ]
          : view === 'instructions'
            ? [
                { itemIndex: 0, hex: { addr: '0x401089', jump: '0x401040' } },
                {
                  itemIndex: 1,
                  hex: {
                    addr: '0xffff800000000081',
                    jump: '0xffffffffffffffff',
                  },
                },
              ]
            : [
                {
                  itemIndex: 0,
                  hex: {
                    from: '0x401044',
                    fcn_addr: '0x401040',
                    to: '0x401000',
                  },
                },
                {
                  itemIndex: 1,
                  hex: {
                    from: '0xffff800000000081',
                    fcn_addr: '0xffffffffffffffff',
                  },
                },
              ];
      assert.deepEqual(body.addressFormats, formats);
      assert.equal(body.truncated, view === 'instructions');
    } else {
      assert.ok(body.addressFormats.length > 0);
      for (const row of body.addressFormats)
        for (const [field, hex] of Object.entries(row.hex))
          assert.equal(
            hex,
            '0x' + BigInt(body.data[row.itemIndex][field]).toString(16),
          );
      if (view === 'instructions') {
        assert.deepEqual(body.addressFormats[0].hex.addr, '0x401040');
        assert.ok(
          body.addressFormats.some(
            (row) => row.hex.addr === '0x401044' && row.hex.jump === '0x401000',
          ),
        );
      }
      if (view === 'xrefs')
        assert.ok(
          body.addressFormats.some((row) => row.hex.from === '0x401089'),
        );
    }
  }
  if (!nativeSample) {
    assert.equal(commands.length, 3);
    assert.ok(commands[1].endsWith('@ 0xffff800000000081'));
    assert.ok(commands[2].endsWith('@ 0xffff800000000081'));
  }
  assert.equal(networkRequests, 0);
  const result = {
    passed: true,
    platform: process.platform,
    node: process.version,
    native: !!nativeSample,
    views: results.length,
    modelRequests: 0,
    networkRequests,
    commands,
    results,
    checks: nativeSample
      ? [
          'native-three-views',
          'callsite-and-target-hex',
          'native-data-matches-formats',
          'no-repeated-decompilation',
        ]
      : [
          'exact-callsite-hex',
          'exact-high-64-bit-hex',
          'native-data-unchanged',
          'only-returned-rows-formatted',
          'counts-and-sentinels-excluded',
          'hex-roundtrip-tool-input',
        ],
    scope: nativeSample
      ? 'Actual local r2 on existing harmless three-function ELF through packaged BinaryAnalyzeTool, three changed-view checks, no decompilation or model task rerun.'
      : 'Packaged BinaryAnalyzeTool receives controlled exact native JSON for three views, including real failed-report CALL values and high 64-bit values; no model/native target execution.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      native: !!nativeSample,
      views: results.length,
      platform: process.platform,
    }),
  );
} finally {
  childProcess.execFile = originalExec;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
  await config?.dispose();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-address-formats-/);
  fs.rmSync(root, { recursive: true, force: true });
}
