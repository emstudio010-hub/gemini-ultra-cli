import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout, clearTimeout } from 'node:timers';
import { isReleaseDocumentation } from './ultra-release-assets.mjs';
import { minimalPeFixture } from './minimal-pe-fixture.mjs';

// A bounded, offline model fixture for verifying an installed archive on each
// platform. No user profile, provider credentials or external analysis tools.
const entry = path.resolve(process.argv[2]);
const reportPath = process.argv[3] && path.resolve(process.argv[3]);
const nativeTool = process.argv[4] && path.resolve(process.argv[4]);
const nativeStep = nativeTool ? 1 : 0;
const packageRoot = path.dirname(path.dirname(entry));
const metadata = JSON.parse(
  await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
);
const ripgrepRoot = path.join(packageRoot, 'bundle/vendor/ripgrep');
const ripgrepManifest = JSON.parse(
  await readFile(path.join(ripgrepRoot, 'manifest.json'), 'utf8'),
);
assert.equal(ripgrepManifest.binaries.length, 6);
for (const binary of ripgrepManifest.binaries) {
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(ripgrepRoot, binary.file)))
      .digest('hex'),
    binary.sha256,
    `Bundled ripgrep checksum mismatch: ${binary.file}`,
  );
}
for (const file of ['COPYING', 'LICENSE-MIT', 'UNLICENSE'])
  await readFile(path.join(ripgrepRoot, file));
const hostRipgrep = ripgrepManifest.binaries.find(
  (binary) =>
    binary.platform === process.platform && binary.arch === process.arch,
);
assert.ok(hostRipgrep, 'Missing bundled ripgrep for this platform');
const ripgrepVersion = execFileSync(
  path.join(ripgrepRoot, hostRipgrep.file),
  ['--version'],
  {
    encoding: 'utf8',
    timeout: 5000,
  },
).split(/\r?\n/)[0];
assert.equal(ripgrepVersion.split(' ')[1], ripgrepManifest.version);
const docsRoot = path.join(packageRoot, 'bundle', 'docs');
for (const file of await readdir(docsRoot, {
  recursive: true,
  withFileTypes: true,
})) {
  const relative = path.relative(
    docsRoot,
    path.join(file.parentPath, file.name),
  );
  assert.ok(
    isReleaseDocumentation(relative),
    `Unexpected distributed documentation: ${relative}`,
  );
}
for (const file of [
  'sidebar.json',
  'ultra-install.md',
  'cli/cli-reference.md',
]) {
  await readFile(path.join(docsRoot, file));
}
await readFile(
  path.join(packageRoot, 'bundle', 'builtin', 'local-reverse', 'SKILL.md'),
);

const scratch = await mkdtemp(path.join(os.tmpdir(), 'ultra-installed-'));
const home = path.join(scratch, 'home');
const workspace = path.join(scratch, 'workspace');
await mkdir(path.join(home, '.gemini'), { recursive: true });
await mkdir(workspace);
const sample = path.join(workspace, 'generated.bin');
const bytes = nativeTool
  ? minimalPeFixture()
  : Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const noteTitle = 'Local header observation';
const noteContent = nativeTool
  ? 'Generated PE imports ExitProcess, verified by native rabin2'
  : 'Generated sample, never executed';
const seen = [];
const failures = [];
let child;
let timer;
let timedOut = false;
const started = Date.now();
function toolOutput(value) {
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return value;
      }
    } else if (value && typeof value === 'object' && 'output' in value) {
      value = value.output;
    } else {
      return value;
    }
  }
  return value;
}
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/chat/completions');
    const body = [];
    for await (const chunk of request) body.push(chunk);
    const payload = JSON.parse(Buffer.concat(body).toString());
    const results = payload.messages.filter(
      (message) => message.role === 'tool',
    );
    const outputs = results.map((result) => toolOutput(result.content));
    const index = seen.length;
    seen.push({ toolResults: results.length });
    let message;
    const call = (name, args) => ({
      content: '',
      tool_calls: [
        {
          index: 0,
          id: `portable_${index}`,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    if (index === 0) {
      message = call('binary_triage', { filePath: sample });
    } else if (nativeTool && index === 1) {
      assert.ok(
        outputs.some(
          (result) =>
            result?.sha256 === sha256 && result.fileType?.includes('PE'),
        ),
      );
      message = call('binary_inspect', {
        filePath: sample,
        view: 'imports',
        maxItems: 10,
      });
    } else if (index === 1 + nativeStep) {
      assert.ok(
        outputs.some((result) => result?.sha256 === sha256),
        `Binary result missing: ${JSON.stringify(results)}`,
      );
      if (nativeTool)
        assert.ok(
          outputs.some(
            (result) =>
              result?.view === 'imports' &&
              Array.isArray(result.data) &&
              result.data.some((item) => item.name === 'ExitProcess'),
          ),
          `Native import table missing: ${JSON.stringify(outputs)}`,
        );
      message = call('grep_search', {
        pattern: 'PORTABLE_SEARCH_NEEDLE',
        dir_path: workspace,
        include_pattern: 'evidence.txt',
        fixed_strings: true,
      });
    } else if (index === 2 + nativeStep) {
      assert.ok(
        outputs.some(
          (result) =>
            JSON.stringify(result).includes('evidence.txt') &&
            JSON.stringify(result).includes('PORTABLE_SEARCH_NEEDLE'),
        ),
        `Bundled search result missing: ${JSON.stringify(outputs)}`,
      );
      message = call('drill_record_fact', {
        category: 'note',
        title: noteTitle,
        notes: noteContent,
      });
    } else if (index === 3 + nativeStep) {
      assert.ok(
        outputs.some((result) => result?.success === true),
        `Note write result missing: ${JSON.stringify(results)}`,
      );
      message = call('drill_query_facts', { currentSessionOnly: true });
    } else {
      assert.equal(index, 4 + nativeStep, 'Unexpected extra model request');
      assert.ok(
        outputs.some(
          (result) =>
            Array.isArray(result) &&
            result.some(
              (fact) => fact.title === noteTitle && fact.factType === 'note',
            ),
        ),
        `Note query result missing: ${JSON.stringify(results)}`,
      );
      message = { content: 'PORTABLE_ANALYSIS_COMPLETE' };
    }
    response.writeHead(200, {
      'Content-Type': payload.stream ? 'text/event-stream' : 'application/json',
    });
    const finish = message.tool_calls ? 'tool_calls' : 'stop';
    response.end(
      payload.stream
        ? `data: ${JSON.stringify({ choices: [{ delta: message, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`
        : JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', ...message },
                finish_reason: finish,
              },
            ],
          }),
    );
  } catch (error) {
    failures.push(String(error));
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ error: { message: 'Local fixture assertion failed' } }),
    );
  }
});
try {
  await writeFile(sample, bytes);
  await writeFile(
    path.join(workspace, 'evidence.txt'),
    'Generated local source\nPORTABLE_SEARCH_NEEDLE\n',
  );
  await writeFile(
    path.join(home, '.gemini', 'settings.json'),
    JSON.stringify({
      security: { auth: { selectedType: 'gateway' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
      model: { maxSessionTurns: 7 },
      tools: {
        core: [
          'binary_triage',
          'drill_record_fact',
          'drill_query_facts',
          'grep_search',
          ...(nativeTool ? ['binary_inspect'] : []),
        ],
        useRipgrep: true,
      },
    }),
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const providers = path.join(scratch, 'providers.json');
  await writeFile(
    providers,
    JSON.stringify({
      version: 1,
      activeProviderId: 'local',
      activeModel: 'offline-fixture',
      reasoningEffort: 'low',
      providers: [
        {
          id: 'local',
          name: 'Local fixture',
          baseUrl: `http://127.0.0.1:${server.address().port}`,
          apiKey: '',
          protocol: 'openai-chat',
          models: ['offline-fixture'],
          defaultModel: 'offline-fixture',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^(http_proxy|https_proxy|all_proxy|no_proxy|GOOGLE_.*|GEMINI_.*)$/i.test(
        key,
      )
    )
      delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    GEMINI_CLI_HOME: home,
    GEMINI_CLI_NO_RELAUNCH: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_ULTRA_PROVIDERS_FILE: providers,
    GEMINI_ULTRA_RUNTIME_FILE: path.join(scratch, 'runtime.json'),
    GEMINI_ULTRA_LOCALE_FILE: path.join(scratch, 'locale.json'),
    GEMINI_ULTRA_PROMPTS_FILE: path.join(scratch, 'prompts.json'),
    GEMINI_DRILL_DIR: path.join(scratch, 'drill'),
    GEMINI_DRILL_DB: path.join(scratch, 'facts.sqlite'),
    GEMINI_PTY_INFO: 'child_process',
    NO_COLOR: '1',
    NO_PROXY: '*',
  });
  if (nativeTool) env.GEMINI_ULTRA_TOOL_RABIN2 = nativeTool;
  await writeFile(
    env.GEMINI_ULTRA_RUNTIME_FILE,
    JSON.stringify({
      collaboration: 'single',
      maxParallel: 1,
      workflow: 'general',
    }),
  );
  await writeFile(
    env.GEMINI_ULTRA_PROMPTS_FILE,
    JSON.stringify({ enabled: false, prompt: '', rules: [] }),
  );
  child = spawn(
    process.execPath,
    [
      entry,
      '-m',
      'offline-fixture',
      '-p',
      'Analyze the generated file, record an observation and query the current session facts.',
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
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
    if (stdout.length > 262144) child.kill();
  });
  child.stderr.on('data', (data) => {
    stderr += data;
    if (stderr.length > 262144) child.kill();
  });
  timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 60000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(timer);
  assert.equal(timedOut, false, 'Installed CLI timed out');
  assert.deepEqual(failures, []);
  assert.equal(code, 0, stderr.slice(-2000));
  assert.equal(seen.length, 5 + nativeStep);
  assert.ok(
    !stderr.includes('Ripgrep is not available'),
    'CLI fell back from bundled ripgrep',
  );
  const result = JSON.parse(stdout);
  assert.equal(result.response, 'PORTABLE_ANALYSIS_COMPLETE');
  assert.equal(result.stats.tools.totalSuccess, 4 + nativeStep);
  assert.equal(
    createHash('sha256')
      .update(await readFile(sample))
      .digest('hex'),
    sha256,
    'Inspection modified the generated sample',
  );
  const db = new DatabaseSync(env.GEMINI_DRILL_DB);
  try {
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM binary_artifact').get().count,
      1,
    );
    assert.equal(
      db.prepare('SELECT sha256 FROM binary_artifact').get().sha256,
      sha256,
    );
    assert.equal(
      db.prepare('SELECT title, content FROM note').get().content,
      noteContent,
    );
  } finally {
    db.close();
  }
  const report = {
    passed: true,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    version: metadata.version,
    elapsedMs: Date.now() - started,
    requests: seen.length,
    successfulTools: result.stats.tools.totalSuccess,
    binaryRecords: 1,
    noteRecords: 1,
    sha256,
    productDocumentationOnly: true,
    nativeInspection: !!nativeTool,
    bundledRipgrep: {
      version: ripgrepVersion,
      sha256: hostRipgrep.sha256,
      verifiedBinaries: ripgrepManifest.binaries.length,
    },
    scope:
      'Installed CLI, isolated profile, generated file and local HTTP model fixture. No live provider or deep reverse-engineering acceptance.',
  };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(timer);
  child?.kill();
  server.close();
  server.closeAllConnections();
  assert.equal(path.dirname(scratch), os.tmpdir());
  await rm(scratch, { recursive: true, force: true });
}
