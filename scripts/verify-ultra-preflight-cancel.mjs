import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const entry = path.resolve(process.argv[2]),
  output = path.resolve(process.argv[3]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-preflight-cancel-'));
for (const [key, name] of Object.entries({
  GEMINI_CLI_HOME: 'profile',
  GEMINI_ULTRA_PROVIDERS_FILE: 'providers.json',
  GEMINI_ULTRA_LOCALE_FILE: 'locale.json',
  GEMINI_ULTRA_TOOLS_FILE: 'tools.json',
  GEMINI_DRILL_DIR: 'drill',
  GEMINI_DRILL_DB: 'facts.sqlite',
}))
  process.env[key] = path.join(root, name);
for (const key of Object.keys(process.env))
  if (/^GEMINI_ULTRA_TOOL_|^JAVA_HOME$|^GEMINI_ULTRA_GHIDRA_HOME$/.test(key))
    delete process.env[key];
const originalExec = childProcess.execFile,
  originalFetch = globalThis.fetch;
let mode = 'pending',
  spawned = 0,
  exited = 0,
  fetches = 0,
  externalRequests = 0,
  requests = 0,
  closed = 0;
const workers = [],
  settlements = [];
// Substitute PATH locator processes with harmless native Node workers. Keep real
// execFile, AbortSignal, exit events and loopback HTTP cancellation underneath.
childProcess.execFile = (_command, _args, options, callback) => {
  spawned++;
  const child = originalExec(
    process.execPath,
    mode === 'pending'
      ? ['-e', 'setInterval(()=>{},1000)']
      : ['-e', 'process.exit(1)'],
    options,
    callback,
  );
  workers.push(child);
  settlements.push(
    new Promise((resolve) =>
      child.once('close', () => {
        exited++;
        resolve();
      }),
    ),
  );
  return child;
};
syncBuiltinESMExports();
const server = createServer((_req, res) => {
  requests++;
  res.on('close', () => {
    closed++;
  });
  if (mode === 'normal') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
  }
});
globalThis.fetch = (url, options) => {
  fetches++;
  if (!String(url).startsWith('http://127.0.0.1:')) {
    externalRequests++;
    throw new Error('External network forbidden');
  }
  return originalFetch(url, { ...options, dispatcher: undefined });
};
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.GEMINI_ULTRA_IDA_MCP_PORT = String(server.address().port);
  const module = fs
    .readdirSync(path.dirname(entry))
    .filter((name) => /^chunk-.+\.js$/.test(name))
    .map((name) => path.join(path.dirname(entry), name))
    .find((file) =>
      /(?:var|class) DrillPreflightTool\b/.test(fs.readFileSync(file, 'utf8')),
    );
  assert.ok(module, 'Packaged DrillPreflightTool missing');
  const core = await import(pathToFileURL(module).href);
  const tool = new core.DrillPreflightTool({}, new core.MessageBus({}));
  const before = new Error('Cancelled before probes');
  await assert.rejects(
    tool
      .build({})
      .execute({ abortSignal: globalThis.AbortSignal.abort(before) }),
    (error) => error === before,
  );
  assert.equal(spawned, 0);
  assert.equal(fetches, 0);
  const controller = new globalThis.AbortController();
  const pending = tool.build({}).execute({ abortSignal: controller.signal });
  const observed = pending.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const waitUntil = async (predicate) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, 'Bounded observation expired');
      await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
    }
  };
  await waitUntil(() => requests === 1 && spawned === 15);
  const cancel = new Error('Cancel running native preflight');
  controller.abort(cancel);
  assert.equal((await observed).error, cancel);
  await Promise.all(settlements);
  await waitUntil(() => closed === 1);
  assert.equal(exited, 15);
  for (const child of workers)
    assert.throws(
      () => process.kill(child.pid, 0),
      (error) => error.code === 'ESRCH',
    );
  mode = 'normal';
  const normal = await tool
    .build({})
    .execute({ abortSignal: new globalThis.AbortController().signal });
  await Promise.all(settlements);
  await waitUntil(() => closed === 2);
  const report = JSON.parse(normal.llmContent);
  assert.deepEqual(report.tools['ida-pro-mcp'], {
    available: true,
    pathOrStatus: 'HTTP 200',
  });
  assert.equal(Object.keys(report.tools).length, 17);
  assert.equal(spawned, 30);
  assert.equal(exited, 30);
  assert.equal(fetches, 2);
  assert.equal(externalRequests, 0);
  assert.equal(fs.existsSync(path.join(root, 'tools.json')), false);
  const result = {
    passed: true,
    platform: process.platform,
    node: process.version,
    nativeLocatorFixtureProcesses: spawned,
    exitedProcesses: exited,
    idaRequests: requests,
    closedConnections: closed,
    modelRequests: 0,
    externalRequests,
    toolConfigurationCreated: false,
    checks: [
      'native-invocation-pre-cancel-no-probes',
      'active-cancel-original-reason',
      'all-native-fixture-locators-exited',
      'pending-ida-connection-closed',
      'subsequent-normal-preflight-works',
      'unread-status-body-closed',
      'tool-path-configuration-unchanged',
    ],
    scope:
      'Installed native DrillPreflightTool, real execFile workers substituted for PATH locators, real loopback IDA status requests. No installed reverse tools executed; no paid model or external network.',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  childProcess.execFile = originalExec;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
  for (const child of workers)
    if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.allSettled(settlements);
  server.closeAllConnections();
  server.close();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.match(path.basename(root), /^ultra-preflight-cancel-/);
  fs.rmSync(root, { recursive: true, force: true });
}
