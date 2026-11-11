import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const minimum = 'v22.19.0';
assert.equal(
  process.version,
  minimum,
  'Run this check with the exact declared minimum Node version',
);
const json = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [operation, ...args] = process.argv.slice(2);
if (operation === 'prepare') {
  const [directory, runFile, output] = args.map((value) => path.resolve(value));
  const source = json(runFile);
  assert.equal(source.workflowName, 'Ultra CLI packages');
  assert.equal(source.headBranch, 'codex/ultra-agent-portable');
  assert.equal(source.status, 'completed');
  assert.equal(source.conclusion, 'success');
  assert.equal(source.event, 'workflow_dispatch');
  assert.match(source.headSha, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(source.databaseId));
  const archives = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = path.join(directory, archives[0]);
  const checksum = fs
    .readFileSync(archive + '.sha256', 'utf8')
    .trim()
    .split(/\s+/);
  const packageSha256 = sha256(fs.readFileSync(archive));
  assert.equal(checksum[0], packageSha256);
  assert.equal(checksum[1], archives[0]);
  const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const read = (member) =>
    execFileSync(tar, ['-xOf', archive, member], {
      maxBuffer: 32 * 1024 * 1024,
    });
  const metadata = JSON.parse(read('package/package.json').toString('utf8'));
  assert.equal(metadata.name, 'gemini-ultra-cli');
  assert.equal(metadata.engines.node, '>=22.19.0');
  const original = json(path.join(directory, 'install-verification.json'));
  assert.equal(original.passed, true);
  assert.equal(original.platform, process.platform);
  assert.equal(original.version, metadata.version);
  const members = execFileSync(tar, ['-tf', archive], {
    encoding: 'utf8',
  }).split(/\r?\n/);
  let sourceChunk;
  for (const member of members.filter((name) =>
    /^package\/bundle\/chunk-[^/]+\.js$/.test(name),
  )) {
    const match = read(member)
      .toString('utf8')
      .match(/GIT_COMMIT_INFO\s*=\s*["']([a-f0-9]+)["']/);
    if (!match) continue;
    assert.equal(match[1], source.headSha.slice(0, 7));
    sourceChunk = member;
    break;
  }
  assert.ok(sourceChunk, 'Source identity missing from packaged chunks');
  const plan = {
    passed: true,
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
    version: metadata.version,
    sourceRunId: source.databaseId,
    sourceCommit: source.headSha,
    sourceUrl: source.url,
    archive,
    packageSha256,
    entrySha256: sha256(read('package/bundle/gemini.js')),
    sourceChunk,
  };
  fs.writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
} else if (operation === 'complete') {
  const [planFile, installedRoot, verificationFile, output] = args.map(
    (value) => path.resolve(value),
  );
  const plan = json(planFile),
    verification = json(verificationFile);
  assert.equal(plan.passed, true);
  assert.equal(plan.runtime, minimum);
  assert.equal(plan.platform, process.platform);
  assert.equal(
    json(path.join(installedRoot, 'package.json')).version,
    plan.version,
  );
  assert.equal(
    sha256(fs.readFileSync(path.join(installedRoot, 'bundle/gemini.js'))),
    plan.entrySha256,
  );
  assert.equal(verification.passed, true);
  assert.equal(verification.node, minimum);
  assert.equal(verification.platform, process.platform);
  assert.equal(verification.version, plan.version);
  assert.equal(verification.requests, 5);
  assert.equal(verification.successfulTools, 4);
  assert.equal(verification.binaryRecords, 1);
  assert.equal(verification.noteRecords, 1);
  assert.equal(verification.bundledRipgrep.verifiedBinaries, 6);
  const result = {
    ...plan,
    verification,
    scope:
      'Same previously built archive installed and executed at the exact Node minimum. Five loopback model requests exercise binary triage, bundled search, fact recording and querying; SQLite records checked. No product rebuild, paid provider, GUI/PTY or complex reverse-engineering acceptance.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      runtime: minimum,
      version: plan.version,
      platform: process.platform,
      successfulTools: verification.successfulTools,
    }),
  );
} else
  throw new Error(
    'Use prepare or complete with the documented workflow arguments.',
  );
