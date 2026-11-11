import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

const entry = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const metadata = JSON.parse(
  fs
    .readFileSync(
      path.join(path.dirname(path.dirname(entry)), 'package.json'),
      'utf8',
    )
    .replace(/^\uFEFF/, ''),
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-tool-paths-'));
const profile = path.join(scratch, 'profile');
const workspace = path.join(scratch, 'workspace');
fs.mkdirSync(path.join(profile, '.gemini'), { recursive: true });
fs.mkdirSync(workspace);
const configFile = path.join(scratch, 'tool settings', 'tools.json');
const selected = path.join(
  scratch,
  'tools with spaces',
  process.platform === 'win32' ? 'native.exe' : 'native',
);
fs.mkdirSync(path.dirname(selected));
fs.copyFileSync(process.execPath, selected);
fs.chmodSync(selected, 0o755);
const requests = [],
  runs = [];
let child,
  timer,
  timedOut = false;
const server = createServer((req, res) => {
  requests.push(req.url);
  res.writeHead(400);
  res.end('{}');
});
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*|NODE_OPTIONS)$/i.test(
        key,
      )
    )
      delete env[key];
  Object.assign(env, {
    HOME: profile,
    USERPROFILE: profile,
    GEMINI_CLI_HOME: profile,
    GEMINI_CLI_NO_RELAUNCH: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_TOOLS_FILE: configFile,
    GEMINI_ULTRA_PROVIDERS_FILE: path.join(scratch, 'providers.json'),
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
    NO_PROXY: '*',
  });
  fs.writeFileSync(
    env.GEMINI_ULTRA_PROVIDERS_FILE,
    JSON.stringify({
      version: 1,
      activeProviderId: 'fixture',
      activeModel: 'fixture-model',
      providers: [
        {
          id: 'fixture',
          name: 'Fixture',
          baseUrl: `http://127.0.0.1:${server.address().port}`,
          apiKey: '',
          protocol: 'openai-chat',
          models: ['fixture-model'],
          defaultModel: 'fixture-model',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  fs.writeFileSync(
    env.GEMINI_ULTRA_LOCALE_FILE,
    JSON.stringify({ locale: 'en' }),
  );
  fs.writeFileSync(
    path.join(profile, '.gemini/settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    }),
  );
  const run = async (input, expected, exit = 0) => {
    child = spawn(
      process.execPath,
      [
        entry,
        '-y',
        '-m',
        'fixture-model',
        '-p',
        input,
        '--output-format',
        'json',
      ],
      {
        cwd: workspace,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (value) => {
      stdout += value;
    });
    child.stderr.on('data', (value) => {
      stderr += value;
    });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 40000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    runs.push({ input, exitCode, stdout, stderr });
    assert.equal(exitCode, exit, stdout + stderr);
    assert.ok((stdout + stderr).includes(expected), stdout + stderr);
    assert.equal(requests.length, 0);
  };
  await run('/drill tools', 'No saved paths.');
  assert.equal(fs.existsSync(configFile), false);
  await run('/drill tools r2 "' + selected + '"', 'Saved r2');
  assert.equal(
    JSON.parse(fs.readFileSync(configFile, 'utf8')).paths.r2,
    selected,
  );
  const first = hash(configFile);
  await run('/drill tools', 'r2: ' + selected);
  assert.equal(hash(configFile), first);
  await run('/drill preflight', 'r2');
  assert.ok(runs.at(-1).stdout.includes(selected));
  assert.equal(hash(configFile), first);
  const missing = path.join(scratch, 'missing tool');
  await run('/drill tools r2 "' + missing + '"', 'unavailable', 42);
  assert.equal(hash(configFile), first);
  await run('/drill tools unknown "' + selected + '"', 'Unsupported tool', 42);
  assert.equal(hash(configFile), first);
  await run('/drill tools reset r2', 'Cleared the saved path for r2');
  assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')).paths, {});
  const backup = fs
    .readdirSync(path.dirname(configFile))
    .find((name) => name.endsWith('.bak'));
  assert.ok(backup);
  assert.equal(hash(path.join(path.dirname(configFile), backup)), first);
  await run('/language 中文', '界面语言已切换为中文');
  await run('/演练台 tools rabin2 "' + selected + '"', '已保存 rabin2');
  const chineseHash = hash(configFile);
  await run('/演练台 tools', '本机已保存的逆向工具路径');
  assert.equal(hash(configFile), chineseHash);
  const broken = '{PRIVATE_BROKEN_TOOL_CONFIGURATION';
  fs.writeFileSync(configFile, broken);
  const corruptHash = hash(configFile);
  await run('/drill tools', 'damaged', 42);
  assert.equal(hash(configFile), corruptHash);
  assert.ok(
    !(runs.at(-1).stdout + runs.at(-1).stderr).includes('PRIVATE_BROKEN'),
  );
  await run('/drill tools reset rabin2', 'damaged', 42);
  assert.equal(hash(configFile), corruptHash);
  assert.equal(timedOut, false);
  const result = {
    passed: true,
    version: metadata.version,
    platform: process.platform,
    timedOut,
    requests,
    selectedPath: selected,
    localRuns: runs.map(({ input, exitCode }) => ({ input, exitCode })),
    config: {
      firstSha256: first,
      backupSha256: hash(path.join(path.dirname(configFile), backup)),
      chineseSha256: chineseHash,
      corruptBeforeSha256: corruptHash,
      corruptAfterSha256: hash(configFile),
    },
    checks: {
      pathWithSpacesPersisted: true,
      freshProcessReadsSavedPath: true,
      preflightUsesSavedPath: true,
      invalidCandidateRetainsConfig: true,
      resetBacksUpOriginal: true,
      chineseAlias: true,
      corruptConfigRetained: true,
      noCorruptContentLeak: true,
      zeroModelRequests: true,
    },
    scope:
      'Actual installed CLI in an isolated profile, real save/reload/preflight/reset/backup and Chinese alias; a copy of Node serves as a native executable path fixture and is never run as a reverse tool. Proves path configuration/discovery, not analysis or installation of a reverse-engineering package.',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      version: metadata.version,
      commands: runs.length,
      requests: requests.length,
    }),
  );
} catch (error) {
  fs.writeFileSync(
    output,
    JSON.stringify(
      { passed: false, timedOut, requests, error: error.message },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    output.replace(/\.json$/, '-output.txt'),
    runs
      .map((run) => run.input + '\n' + run.stdout + '\nSTDERR\n' + run.stderr)
      .join('\n'),
  );
}
