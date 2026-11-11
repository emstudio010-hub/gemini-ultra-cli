import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ultra-native-preparation-'),
);
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_DRILL_DB: 'facts.sqlite',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_RUNTIME_FILE: 'runtime.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
}))
  process.env[key] = path.join(root, name);
const workspace = path.join(root, 'workspace');
fs.mkdirSync(workspace);
const sample = path.join(workspace, 'artificial & sample.bin');
fs.writeFileSync(sample, 'SOURCE_OWNED_PREPARATION_FIXTURE');
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sampleHash = hash(sample);
let core;
if (source)
  core = await import(
    pathToFileURL(path.join(repo, 'packages/core/dist/index.js')).href
  );
else {
  const directory = path.dirname(entry);
  const module = fs
    .readdirSync(directory)
    .filter((file) => /^chunk-.+\.js$/.test(file))
    .map((file) => path.join(directory, file))
    .find((file) =>
      /(?:var|class) BinaryDecompileTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged binary decompile implementation missing');
  core = await import(pathToFileURL(module).href);
}
assert.equal(typeof core.BinaryDecompileTool, 'function');
const config = new core.Config({
  sessionId: 'native-preparation-fixture',
  model: 'fixture',
  targetDir: workspace,
  cwd: workspace,
  debugMode: false,
  usageStatisticsEnabled: false,
});
await config.storage.initialize();
const home = path.join(root, 'artificial ghidra & install');
fs.mkdirSync(path.join(home, 'Ghidra/Framework/Utility/lib'), {
  recursive: true,
});
fs.mkdirSync(path.join(home, 'support'));
fs.writeFileSync(
  path.join(home, 'Ghidra/Framework/Utility/lib/Utility.jar'),
  'ARTIFICIAL_INSTALLATION_NOT_EXECUTABLE',
);
fs.writeFileSync(
  path.join(home, 'Ghidra/application.properties'),
  'application.version=12.1.4\n',
);
fs.writeFileSync(
  path.join(home, 'support/launch.properties'),
  'VMARGS=-Djava.system.class.loader=ghidra.GhidraClassLoader\n',
);
const platform = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}_${process.arch === 'arm64' ? 'arm_64' : 'x86_64'}`;
const native = path.join(home, 'Ghidra/Features/Decompiler/os', platform);
fs.mkdirSync(native, { recursive: true });
fs.writeFileSync(
  path.join(
    native,
    process.platform === 'win32' ? 'decompile.exe' : 'decompile',
  ),
  'ARTIFICIAL_FILE_NEVER_EXECUTED',
  { mode: 0o755 },
);
process.env.GEMINI_ULTRA_GHIDRA_HOME = home;
process.env.GEMINI_ULTRA_TOOL_JAVA = process.execPath;
delete process.env.JAVA_HOME;
const originalMkdir = fsp.mkdir,
  originalExec = childProcess.execFile;
const controller = new globalThis.AbortController();
let preparedScratch,
  launches = 0;
const rollbacks = [];
try {
  // Observe a real final preparation operation; do not fake the product result.
  fsp.mkdir = async (...args) => {
    const result = await originalMkdir(...args);
    const directory = String(args[0]);
    if (
      path.basename(directory) === 'project' &&
      path.basename(path.dirname(directory)).startsWith('ultra-decompile-')
    ) {
      preparedScratch = path.dirname(directory);
      controller.abort(new Error('Stopped during final preparation'));
    }
    return result;
  };
  childProcess.execFile = (...args) => {
    if (
      Array.isArray(args[1]) &&
      args[1].includes('ghidra.app.util.headless.AnalyzeHeadless')
    )
      launches++;
    return Reflect.apply(originalExec, childProcess, args);
  };
  syncBuiltinESMExports();
  let cancelled;
  try {
    cancelled = await new core.BinaryDecompileTool(
      config,
      config.getMessageBus(),
    )
      .build({ filePath: path.basename(sample) })
      .execute({ abortSignal: controller.signal });
  } finally {
    fsp.mkdir = originalMkdir;
    childProcess.execFile = originalExec;
    syncBuiltinESMExports();
  }
  assert.ok(preparedScratch, 'Final project preparation hook did not run');
  assert.equal(cancelled.error?.message, 'Stopped during final preparation');
  assert.equal(launches, 0);
  assert.equal(fs.existsSync(preparedScratch), false);
  assert.equal(hash(sample), sampleHash);
  const artifactRoot = path.join(
    config.storage.getProjectTempDir(),
    'decompilations',
  );
  const cancelledArtifacts = fs
    .readdirSync(artifactRoot)
    .flatMap((directory) => fs.readdirSync(path.join(artifactRoot, directory)));
  assert.deepEqual(cancelledArtifacts, ['analysis.log']);
  assert.equal(fs.existsSync(process.env.GEMINI_DRILL_DB), false);
  for (const name of ['literal # target.txt', 'literal%20target.txt']) {
    const target = path.join(workspace, name);
    fs.writeFileSync(target, 'ORIGINAL');
    const result = await new core.VerifiedPatchTransactionTool(
      config,
      config.getMessageBus(),
    )
      .build({ targetFile: name, newContent: 'PATCHED' })
      .execute({ abortSignal: new globalThis.AbortController().signal });
    assert.equal(result.error, undefined, JSON.stringify(result));
    const record = JSON.parse(result.llmContent);
    assert.equal(fs.readFileSync(target, 'utf8'), 'PATCHED');
    childProcess.execFileSync(process.execPath, [record.rollbackScript], {
      windowsHide: true,
      timeout: 5000,
    });
    assert.equal(fs.readFileSync(target, 'utf8'), 'ORIGINAL');
    assert.equal(fs.readFileSync(record.backupFile, 'utf8'), 'ORIGINAL');
    rollbacks.push({ name, restored: true, backupPreserved: true });
    if (name.includes('%20')) {
      const relocated = path.join(workspace, 'moved # %20 中文');
      fs.mkdirSync(relocated);
      for (const file of [record.rollbackScript, record.backupFile])
        fs.copyFileSync(file, path.join(relocated, path.basename(file)));
      fs.writeFileSync(path.join(relocated, name), 'RELOCATED_PATCHED');
      childProcess.execFileSync(
        process.execPath,
        [path.join(relocated, path.basename(record.rollbackScript))],
        { windowsHide: true, timeout: 5000 },
      );
      assert.equal(
        fs.readFileSync(path.join(relocated, name), 'utf8'),
        'ORIGINAL',
      );
      rollbacks.push({ name, relocated: true, restored: true });
    }
  }
  assert.equal(
    fs.existsSync(path.join(workspace, 'literal target.txt')),
    false,
  );
  assert.equal(hash(sample), sampleHash);
  const facts = core.DrillStore.getInstance().queryPatchTransactions(
    'native-preparation-fixture',
  );
  assert.equal(facts.length, 2);
  const result = {
    passed: true,
    platform: process.platform,
    source,
    cancellation: {
      message: cancelled.error.message,
      finalPreparationObserved: true,
      launches,
      scratchRemoved: !fs.existsSync(preparedScratch),
      artifacts: cancelledArtifacts,
      sampleHash,
      afterSampleHash: hash(sample),
    },
    rollbacks,
    factCount: facts.length,
    modelRequests: 0,
    scope:
      'Final preparation cancellation with artificial installation files and an executable discovery reference never launched; real generated Node rollback over artificial text files, including relocated artifacts. Not new native Ghidra analysis.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  fsp.mkdir = originalMkdir;
  childProcess.execFile = originalExec;
  syncBuiltinESMExports();
  core.DrillStore.resetInstance();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-native-preparation-/);
  fs.rmSync(root, { recursive: true, force: true });
}
