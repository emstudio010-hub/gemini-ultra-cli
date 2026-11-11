import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const source = process.argv.includes('--source');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-patch-access-'));
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
const workspace = path.join(scratch, 'workspace'),
  foreign = path.join(scratch, 'foreign'),
  extra = path.join(scratch, 'additional');
for (const directory of [workspace, foreign, extra]) fs.mkdirSync(directory);
const target = path.join(foreign, 'outside.txt'),
  safe = path.join(workspace, 'safe.txt');
fs.writeFileSync(target, 'PRIVATE_PATCH_SCOPE_MARKER');
fs.writeFileSync(safe, 'ORIGINAL');
fs.symlinkSync(
  foreign,
  path.join(workspace, 'redirect'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = { target: hash(target), safe: hash(safe) };
let core, tools;
if (source) {
  core = await import(
    pathToFileURL(path.join(repo, 'packages/core/dist/index.js')).href
  );
  tools = await import(
    pathToFileURL(
      path.join(repo, 'packages/core/dist/src/tools/reverseTools.js'),
    ).href
  );
} else {
  const directory = path.dirname(entry);
  const module = fs
    .readdirSync(directory)
    .filter((file) => /^chunk-.+\.js$/.test(file))
    .map((file) => path.join(directory, file))
    .find((file) =>
      /(?:var|class) VerifiedPatchTransactionTool\b/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
  assert.ok(module, 'Packaged patch tools missing');
  core = tools = await import(pathToFileURL(module).href);
}
const config = new core.Config({
  sessionId: 'patch-access-fixture',
  model: 'fixture',
  targetDir: workspace,
  cwd: workspace,
  debugMode: false,
  usageStatisticsEnabled: false,
});
await config.storage.initialize();
config.getWorkspaceContext().addReadOnlyPath(foreign);
config.getWorkspaceContext().addDirectory(extra);
assert.equal(config.validatePathAccess(target, 'read'), null);
assert.ok(config.validatePathAccess(target, 'write'));
const bus = config.getMessageBus();
const apply = new tools.ApplyPatchTool(config, bus),
  verified = new tools.VerifiedPatchTransactionTool(config, bus);
const execute = (
  tool,
  params,
  signal = new globalThis.AbortController().signal,
) => tool.build(params).execute({ abortSignal: signal });
const patch = (content) => `*** Begin Patch\n${content}\n*** End Patch`;
const denials = [],
  cancellations = [],
  transactions = [];
try {
  for (const file of [
    target,
    '../foreign/outside.txt',
    'redirect/outside.txt',
  ]) {
    for (const operation of ['Add', 'Update', 'Delete']) {
      const suffix =
        operation === 'Add'
          ? '\n+FORBIDDEN'
          : operation === 'Update'
            ? '\n@@\n-PRIVATE_PATCH_SCOPE_MARKER\n+FORBIDDEN'
            : '';
      const result = await execute(apply, {
        patch: patch(`*** ${operation} File: ${file}${suffix}`),
      });
      assert.ok(
        result.error?.message.includes('Path not in workspace'),
        JSON.stringify(result),
      );
      assert.ok(!JSON.stringify(result).includes('PRIVATE_PATCH_SCOPE_MARKER'));
      denials.push({
        tool: 'apply_patch',
        operation,
        file,
        error: result.error,
      });
    }
    const result = await execute(verified, {
      targetFile: file,
      newContent: 'FORBIDDEN',
      applyToTarget: false,
    });
    assert.ok(
      result.error?.message.includes('Path not in workspace'),
      JSON.stringify(result),
    );
    denials.push({
      tool: 'verified_patch_transaction',
      file,
      error: result.error,
    });
  }
  const nested = await execute(apply, {
    patch: patch('*** Add File: redirect/new-parent/forbidden.txt\n+FORBIDDEN'),
  });
  assert.ok(nested.error?.message.includes('Path not in workspace'));
  denials.push({
    tool: 'apply_patch',
    operation: 'nested-add',
    error: nested.error,
  });
  const mixed = await execute(apply, {
    patch: patch(
      '*** Update File: safe.txt\n@@\n-ORIGINAL\n+MODIFIED\n*** Delete File: ../foreign/outside.txt',
    ),
  });
  assert.ok(mixed.error?.message.includes('Path not in workspace'));
  denials.push({
    tool: 'apply_patch',
    operation: 'mixed-preflight',
    error: mixed.error,
  });
  for (const [tool, params] of [
    [apply, { patch: patch('*** Delete File: safe.txt') }],
    [verified, { targetFile: 'safe.txt', newContent: 'FORBIDDEN' }],
  ]) {
    const result = await execute(
      tool,
      params,
      globalThis.AbortSignal.abort(new Error('Stopped before patch')),
    );
    assert.equal(result.error?.message, 'Stopped before patch');
    cancellations.push({
      tool: tool === apply ? 'apply_patch' : 'verified_patch_transaction',
      error: result.error,
    });
  }
  assert.deepEqual({ target: hash(target), safe: hash(safe) }, before);
  assert.deepEqual(fs.readdirSync(foreign), ['outside.txt']);
  assert.deepEqual(fs.readdirSync(workspace).sort(), ['redirect', 'safe.txt']);
  assert.equal(fs.existsSync(process.env.GEMINI_DRILL_DB), false);
  const positive = await execute(apply, {
    patch: patch(
      '*** Add File: nested & literal/created.txt\n+ORIGINAL\n*** Update File: nested & literal/created.txt\n@@\n-ORIGINAL\n+MODIFIED\n*** Add File: delete-me.txt\n+REMOVE\n*** Delete File: delete-me.txt',
    ),
  });
  assert.equal(positive.error, undefined);
  assert.equal(
    fs.readFileSync(
      path.join(workspace, 'nested & literal/created.txt'),
      'utf8',
    ),
    'MODIFIED',
  );
  assert.equal(fs.existsSync(path.join(workspace, 'delete-me.txt')), false);
  const extraFile = path.join(extra, 'allowed.txt');
  const extraResult = await execute(apply, {
    patch: patch(`*** Add File: ${extraFile}\n+EXTRA_WORKSPACE`),
  });
  assert.equal(extraResult.error, undefined);
  assert.equal(fs.readFileSync(extraFile, 'utf8'), 'EXTRA_WORKSPACE');
  for (const applyToTarget of [false, true]) {
    const name = applyToTarget ? 'applied & target.txt' : 'staged & target.txt';
    const file = path.join(workspace, name);
    fs.writeFileSync(file, 'BEFORE');
    const result = await execute(verified, {
      targetFile: name,
      newContent: 'AFTER',
      applyToTarget,
    });
    assert.equal(result.error, undefined, JSON.stringify(result));
    const record = JSON.parse(result.llmContent);
    assert.equal(record.originalFile, fs.realpathSync(file));
    assert.equal(record.appliedToTarget, applyToTarget);
    assert.equal(
      fs.readFileSync(file, 'utf8'),
      applyToTarget ? 'AFTER' : 'BEFORE',
    );
    assert.equal(fs.readFileSync(record.backupFile, 'utf8'), 'BEFORE');
    assert.equal(fs.readFileSync(record.modifiedFile, 'utf8'), 'AFTER');
    assert.ok(
      fs
        .readFileSync(record.verificationFile, 'utf8')
        .includes(applyToTarget ? 'APPLIED_AND_VERIFIED' : 'STAGED_VERIFIED'),
    );
    assert.ok(fs.statSync(record.diffFile).size > 0);
    // Execute only our generated rollback over an artificial text file.
    if (applyToTarget) {
      execFileSync(process.execPath, [record.rollbackScript], {
        windowsHide: true,
        timeout: 5000,
      });
      assert.equal(fs.readFileSync(file, 'utf8'), 'BEFORE');
    }
    transactions.push({
      applyToTarget,
      originalFile: record.originalFile,
      rollbackVerified: applyToTarget,
      artifacts: 5,
    });
  }
  const facts = core.DrillStore.getInstance().queryPatchTransactions(
    'patch-access-fixture',
  );
  const factCount = facts.length;
  assert.equal(factCount, 2);
  assert.deepEqual(facts.map((fact) => fact.status).sort(), [
    'applied',
    'staged',
  ]);
  assert.equal(hash(target), before.target);
  assert.equal(hash(safe), before.safe);
  const result = {
    passed: true,
    platform: process.platform,
    source,
    denials,
    cancellations,
    before,
    after: { target: hash(target), safe: hash(safe) },
    positiveOperations: 4,
    additionalWorkspace: true,
    transactions,
    factCount,
    modelRequests: 0,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  core.DrillStore.resetInstance();
  assert.equal(path.dirname(scratch), os.tmpdir());
  assert.match(path.basename(scratch), /^ultra-patch-access-/);
  fs.rmSync(scratch, { recursive: true, force: true });
}
