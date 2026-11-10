import {
  cp,
  mkdir,
  readFile,
  writeFile,
  access,
  readdir,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentationFilter } from './ultra-release-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const version = process.env.GEMINI_ULTRA_RELEASE_VERSION || '1.0.0-preview.11';
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error('Invalid release version');
const runNode = (args, env = {}, cwd = root) =>
  execFileSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
runNode(['scripts/generate-git-commit-info.js']);
// These files are ignored by Git, so a fresh checkout must generate them first.
runNode(['esbuild.client.js'], {}, path.join(root, 'packages/devtools'));
runNode([
  'node_modules/typescript/bin/tsc',
  '-p',
  'packages/devtools/tsconfig.build.json',
]);
runNode(['scripts/build-morphicons.mjs']);
runNode([
  'node_modules/typescript/bin/tsc',
  '-b',
  'packages/core',
  'packages/cli',
]);
runNode(['packages/core/scripts/bundle-browser-mcp.mjs']);
runNode(['esbuild.config.js'], {
  GEMINI_ULTRA_CLI_ONLY: '1',
  CLI_VERSION: version,
});

const output = path.join(root, 'artifacts', 'ultra-release');
// Each build uses a fresh staging directory.
const staging = path.join(output, `gemini-ultra-cli-${version}-${Date.now()}`);
await mkdir(staging, { recursive: true });
const graph = JSON.parse(await readFile('bundle/esbuild.json', 'utf8'));
const bundleRoot = path.join(root, 'bundle');
const bundleDest = path.join(staging, 'bundle');
await mkdir(bundleDest, { recursive: true });
// Copy only this build's outputs. Never inherit files left in a developer's bundle/.
for (const file of Object.keys(graph.outputs)) {
  const source = path.resolve(root, file);
  const relative = path.relative(bundleRoot, source);
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Build output is outside bundle/: ${file}`);
  }
  const destination = path.join(bundleDest, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}
const assets = [
  ['packages/core/src/policy/policies', 'policies'],
  ['packages/core/src/skills/builtin', 'builtin'],
  ['packages/core/dist/bundled', 'bundled'],
  ['packages/cli/src/commands/extensions/examples', 'examples'],
];
for (const [source, destination] of assets) {
  await cp(path.join(root, source), path.join(bundleDest, destination), {
    recursive: true,
    filter: (file) => !['node_modules', 'dist'].includes(path.basename(file)),
  });
}
const docsRoot = path.join(root, 'docs');
await cp(docsRoot, path.join(bundleDest, 'docs'), {
  recursive: true,
  filter: documentationFilter(docsRoot),
});
for (const file of await readdir(path.join(root, 'packages/cli/src/utils'))) {
  if (file.endsWith('.sb'))
    await cp(
      path.join(root, 'packages/cli/src/utils', file),
      path.join(bundleDest, file),
    );
}
await cp(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'));
await cp(
  path.join(root, 'docs', 'ultra-install.md'),
  path.join(staging, 'README.md'),
);
await cp(
  path.join(root, 'third_party', 'morphicons-2.0.2', 'LICENSE'),
  path.join(staging, 'MORPHICONS-LICENSE'),
);
await writeFile(
  path.join(staging, 'THIRD-PARTY-NOTICES.md'),
  '# Sources\n\nGemini CLI, Copyright Google LLC, Apache-2.0.\n\nMorphicons 2.0.2, Copyright Guillermo, MIT; see MORPHICONS-LICENSE.\n\nPrompt/rule and drill layout ideas reference YuJunZhiXue/dsh-purge 1.1.71: https://github.com/YuJunZhiXue/dsh-purge. No encrypted default prompt or host patches are included.\n',
);
// Preserve licenses of bundled dependencies instead of relying on development node_modules.
const packageDirs = new Set();
for (const input of Object.keys(graph.inputs)) {
  const marker = input.lastIndexOf('node_modules/');
  if (marker < 0) continue;
  const prefix = input.slice(0, marker + 'node_modules/'.length);
  const segments = input.slice(marker + 'node_modules/'.length).split('/');
  packageDirs.add(
    prefix + segments.slice(0, segments[0].startsWith('@') ? 2 : 1).join('/'),
  );
}
const notices = [];
for (const directory of [...packageDirs].sort()) {
  try {
    const metadata = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    );
    let license = '';
    for (const candidate of [
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'license',
      'license.md',
      'LICENCE',
      'COPYING',
    ]) {
      try {
        await access(path.join(directory, candidate));
        license = await readFile(path.join(directory, candidate), 'utf8');
        break;
      } catch {
        /* Try the next standard filename. */
      }
    }
    notices.push(
      `## ${metadata.name} ${metadata.version}\n\nDeclared license: ${JSON.stringify(metadata.license || 'see upstream package')}\n\n${license || metadata.homepage || metadata.repository?.url || ''}\n`,
    );
  } catch {
    /* Virtual esbuild inputs do not always correspond to package roots. */
  }
}
await writeFile(
  path.join(staging, 'THIRD-PARTY-LICENSES.txt'),
  notices.join('\n---\n\n'),
);
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  path.join(staging, 'package.json'),
  JSON.stringify(
    {
      name: 'gemini-ultra-cli',
      version,
      description:
        'Gemini Ultra CLI with providers, collaboration and local reverse engineering workflows',
      type: 'module',
      license: 'Apache-2.0',
      engines: { node: '>=22.19.0' },
      bin: {
        'gemini-ultra': 'bundle/gemini.js',
        'gemini-ultra-cli': 'bundle/gemini.js',
      },
      files: [
        'bundle',
        'README.md',
        'LICENSE',
        'MORPHICONS-LICENSE',
        'THIRD-PARTY-NOTICES.md',
        'THIRD-PARTY-LICENSES.txt',
      ],
      repository: {
        type: 'git',
        url: 'https://github.com/emstudio010-hub/gemini-ultra-cli.git',
      },
      optionalDependencies: Object.fromEntries(
        Object.entries(rootPackage.optionalDependencies || {}).filter(
          ([name]) => name.startsWith('@lydell/'),
        ),
      ),
    },
    null,
    2,
  ),
);
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error(
    'Run via npm run package:ultra so npm CLI can be resolved portably.',
  );
execFileSync(
  process.execPath,
  [npmCli, 'pack', staging, '--pack-destination', output, '--ignore-scripts'],
  { cwd: root, stdio: 'inherit' },
);
const archiveName = `gemini-ultra-cli-${version}.tgz`;
const archiveHash = createHash('sha256')
  .update(await readFile(path.join(output, archiveName)))
  .digest('hex');
await writeFile(
  path.join(output, `${archiveName}.sha256`),
  `${archiveHash}  ${archiveName}\n`,
);
console.log(`Release staging: ${staging}`);
