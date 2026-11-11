import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const json = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const [mode, ...args] = process.argv.slice(2);
if (mode === 'prepare') {
  const [directory, runFile, runner, output] = args;
  const run = json(runFile);
  assert.equal(run.databaseId, 43102874981);
  assert.equal(run.headSha, '0b6065432fb6f585ac2233fa6f4a677a061cc947');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'failure');
  assert.ok(['windows-latest', 'macos-latest'].includes(runner));
  const job = run.jobs.find((job) => job.name === 'package (' + runner + ')');
  assert.equal(job?.conclusion, 'failure');
  const failures = job.steps
    .filter((step) => step.conclusion === 'failure')
    .map((step) => step.name);
  assert.deepEqual(failures, ['Verify native binary address precision']);
  assert.equal(
    job.steps.find(
      (step) => step.name === 'Verify isolated package installation',
    )?.conclusion,
    'success',
  );
  assert.equal(
    job.steps.find((step) => step.name === 'Run actions/upload-artifact@v4')
      ?.conclusion,
    'success',
  );
  const archives = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = path.resolve(directory, archives[0]);
  const sha256 = hash(archive);
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
  assert.equal(metadata.version, '1.0.0-preview.70');
  const members = execFileSync('tar', ['-tf', archive], {
    encoding: 'utf8',
  }).split(/\r?\n/);
  let sourceChunk;
  for (const member of members.filter((name) =>
    /^package\/bundle\/chunk-.+\.js$/.test(name),
  )) {
    const code = execFileSync('tar', ['-xOf', archive, member], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const found = code.match(/GIT_COMMIT_INFO\s*=\s*["']([a-f0-9]+)["']/);
    if (found) {
      assert.equal(found[1], run.headSha.slice(0, 7));
      sourceChunk = member;
    }
  }
  assert.ok(sourceChunk);
  const plan = {
    passed: true,
    runner,
    sourceRunId: run.databaseId,
    sourceCommit: run.headSha,
    version: metadata.version,
    archive,
    packageSha256: sha256,
    sourceChunk,
  };
  fs.writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan));
} else if (mode === 'complete') {
  const [planFile, precisionFile, output] = args;
  const plan = json(planFile),
    precision = json(precisionFile);
  assert.equal(plan.passed, true);
  assert.equal(hash(plan.archive), plan.packageSha256);
  assert.equal(precision.passed, true);
  assert.equal(precision.node, 'v22.19.0');
  assert.equal(precision.source, false);
  assert.equal(precision.modelRequests, 0);
  assert.equal(precision.sampleExecuted, false);
  assert.equal(precision.before, precision.after);
  assert.equal(precision.native, null);
  assert.equal(precision.calls.length, 4);
  const result = { ...plan, precision };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      runner: plan.runner,
      packageSha256: plan.packageSha256,
    }),
  );
} else throw new Error('Expected prepare or complete');
