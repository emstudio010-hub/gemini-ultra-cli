import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const json = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const [mode, ...args] = process.argv.slice(2);
if (mode === 'prepare') {
  const [directory, sourceRun, output] = args,
    run = json(sourceRun);
  assert.equal(run.databaseId, 43236115019);
  assert.equal(run.headSha, '734806fd8c48a0cfa0260920cc955fed9ef8b0eb');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'failure');
  const job = run.jobs.find((item) => item.name === 'package (windows-latest)');
  assert.equal(job?.conclusion, 'failure');
  assert.deepEqual(
    job.steps
      .filter((step) => step.conclusion === 'failure')
      .map((step) => step.name),
    ['Verify native binary address precision'],
  );
  for (const name of [
    'Verify isolated package installation',
    'Run actions/upload-artifact@v4',
  ])
    assert.equal(
      job.steps.find((step) => step.name === name)?.conclusion,
      'success',
    );
  const archives = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = path.resolve(directory, archives[0]),
    sha256 = hash(archive);
  assert.equal(
    fs
      .readFileSync(archive + '.sha256', 'utf8')
      .trim()
      .split(/\s+/)[0],
    sha256,
  );
  const metadata = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );
  assert.equal(metadata.version, '1.0.0-preview.83');
  const chunks = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((file) => /^package\/bundle\/chunk-.+\.js$/.test(file));
  let identity = false,
    implementation = false;
  for (const file of chunks) {
    const code = execFileSync('tar', ['-xOf', archive, file], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const declared = code.match(/GIT_COMMIT_INFO\s*=\s*["']([a-f0-9]+)["']/);
    if (declared) {
      assert.equal(declared[1], run.headSha.slice(0, 7));
      identity = true;
    }
    if (code.includes('addressFormats: analysisAddressFormats(data)'))
      implementation = true;
  }
  assert.ok(identity);
  assert.ok(implementation);
  const plan = {
    passed: true,
    sourceRunId: run.databaseId,
    sourceCommit: run.headSha,
    version: metadata.version,
    archive,
    packageSha256: sha256,
    runner: 'windows-latest',
    rebuilt: false,
  };
  fs.writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan));
} else if (mode === 'complete') {
  const [planFile, resultFile, output] = args,
    plan = json(planFile),
    result = json(resultFile);
  assert.equal(plan.passed, true);
  assert.equal(hash(plan.archive), plan.packageSha256);
  assert.equal(result.passed, true);
  assert.equal(result.platform, 'win32');
  assert.equal(result.node, 'v22.19.0');
  assert.equal(result.native, false);
  assert.equal(result.views, 3);
  assert.equal(result.modelRequests, 0);
  assert.equal(result.networkRequests, 0);
  assert.equal(result.results[1].addressFormats[0].hex.addr, '0x401089');
  assert.equal(result.results[2].addressFormats[0].hex.from, '0x401044');
  const report = { ...plan, verification: result };
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      packageSha256: plan.packageSha256,
      rebuilt: false,
    }),
  );
} else throw new Error('Expected prepare or complete');
